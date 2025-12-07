const { Types } = require('mongoose')

const AuditLog = require('../models/AuditLog')
const winstonLogger = require('../utils/winstonLogger')
const { sanitizeForLogging } = require('../utils/logger')
const constants = require('../utils/constants')

const { SECURITY_SEVERITY } = constants

const APP_VERSION = (() => {
    try {
        // eslint-disable-next-line global-require
        const pkg = require('../package.json')
        return pkg.version || '1.0.0'
    } catch (error) {
        return '1.0.0'
    }
})()

const FALLBACK_USER_ID = (() => {
    const candidate = process.env.ANONYMOUS_AUDIT_USER_ID
    if (candidate && Types.ObjectId.isValid(candidate)) {
        return candidate
    }
    return '000000000000000000000000'
})()

const securityActionMap = {
    SECRET_CODE_VALIDATION_FAILED: {
        action: 'SECRET_CODE_FAILED',
        resourceType: 'SECURITY',
        riskLevel: 'HIGH',
        severity: SECURITY_SEVERITY.HIGH
    },
    SECRET_CODE_VALIDATION_ERROR: {
        action: 'SECRET_CODE_FAILED',
        resourceType: 'SECURITY',
        riskLevel: 'HIGH',
        severity: SECURITY_SEVERITY.HIGH
    },
    SECRET_CODE_VALIDATION_SUCCESS: {
        action: 'SECRET_CODE_USED',
        resourceType: 'SECURITY',
        riskLevel: 'LOW',
        severity: SECURITY_SEVERITY.LOW
    },
    VOTER_ELIGIBILITY_CHECK_FAILED: {
        action: 'SUSPICIOUS_ACTIVITY',
        resourceType: 'SECURITY',
        riskLevel: 'MEDIUM',
        severity: SECURITY_SEVERITY.MEDIUM
    },
    VOTER_ELIGIBILITY_CHECK_ERROR: {
        action: 'SUSPICIOUS_ACTIVITY',
        resourceType: 'SECURITY',
        riskLevel: 'MEDIUM',
        severity: SECURITY_SEVERITY.MEDIUM
    },
    RATE_LIMIT_EXCEEDED: {
        action: 'SUSPICIOUS_ACTIVITY',
        resourceType: 'SECURITY',
        riskLevel: 'MEDIUM',
        severity: SECURITY_SEVERITY.MEDIUM
    },
    SESSION_EXPIRED: {
        action: 'SECURITY_EVENT',
        resourceType: 'SECURITY',
        riskLevel: 'LOW',
        severity: SECURITY_SEVERITY.LOW
    },
    DEVICE_FINGERPRINT_MISMATCH: {
        action: 'SECURITY_EVENT',
        resourceType: 'SECURITY',
        riskLevel: 'MEDIUM',
        severity: SECURITY_SEVERITY.MEDIUM
    }
}

const resolveUserId = (userId) => {
    if (userId && Types.ObjectId.isValid(userId)) {
        return userId.toString()
    }
    return FALLBACK_USER_ID
}

const getFirstForwardedFor = (headerValue) => {
    if (!headerValue) {
        return undefined
    }

    if (Array.isArray(headerValue)) {
        return headerValue[0]
    }

    return headerValue.split(',')[0]?.trim()
}

const extractRequestMetadata = (req = {}) => {
    const headers = req.headers || {}

    const forwarded = getFirstForwardedFor(headers['x-forwarded-for'])
    const ipAddress = forwarded || req.ip || req.connection?.remoteAddress || 'unknown'

    return {
        ipAddress,
        userAgent: headers['user-agent'],
        sessionId: req.sessionID || headers['x-session-id'],
        requestId: req.id || headers['x-request-id'],
        correlationId: headers['x-correlation-id'],
        deviceFingerprint: req.deviceFingerprint,
        environment: process.env.NODE_ENV || 'development',
        version: APP_VERSION
    }
}

const buildMetadata = (requestMetadata, additionalData) => {
    const metadata = {
        requestId: requestMetadata.requestId,
        correlationId: requestMetadata.correlationId,
        environment: requestMetadata.environment,
        version: requestMetadata.version
    }

    const sanitizedAdditional = additionalData && Object.keys(additionalData).length > 0
        ? sanitizeForLogging(additionalData)
        : undefined

    if (sanitizedAdditional && Object.keys(sanitizedAdditional).length > 0) {
        metadata.additionalData = sanitizedAdditional
    }

    Object.keys(metadata).forEach((key) => {
        if (metadata[key] === undefined) {
            delete metadata[key]
        }
    })

    return Object.keys(metadata).length > 0 ? metadata : undefined
}

const mapSecurityAction = (action) => {
    if (!action) {
        return {
            action: 'SECURITY_EVENT',
            resourceType: 'SECURITY',
            riskLevel: 'LOW',
            severity: SECURITY_SEVERITY.LOW
        }
    }

    const normalized = action.toUpperCase()
    return securityActionMap[normalized] || {
        action: 'SECURITY_EVENT',
        resourceType: 'SECURITY',
        riskLevel: normalized.includes('FAILED') || normalized.includes('ERROR') ? 'MEDIUM' : 'LOW',
        severity: normalized.includes('FAILED') || normalized.includes('ERROR')
            ? SECURITY_SEVERITY.MEDIUM
            : SECURITY_SEVERITY.LOW
    }
}

const determineRiskLevel = (actionSettings, success, override) => {
    if (override?.riskLevel) {
        return override.riskLevel
    }

    if (success === false) {
        return 'HIGH'
    }

    return actionSettings.riskLevel || 'LOW'
}

const sanitizeDetails = (details) => {
    if (!details) {
        return {}
    }
    return sanitizeForLogging(details)
}

const persistAuditLog = async (doc) => {
    try {
        await AuditLog.create(doc)
    } catch (error) {
        winstonLogger.logError(error, {
            action: 'persistAuditLog',
            auditAction: doc.action,
            resourceType: doc.resourceType
        })
    }
}

const buildErrorMessage = (details = {}) => {
    return details.errorMessage || details.error || details.reason || undefined
}

const logSecurityAction = async (userId, eventType, details = {}, success = true, req) => {
    const resolvedUser = resolveUserId(userId)
    const actionSettings = mapSecurityAction(eventType)
    const requestMetadata = extractRequestMetadata(req)

    const payloadDetails = {
        ...details,
        originalAction: eventType,
        severity: actionSettings.severity
    }

    const sanitizedDetails = sanitizeDetails(payloadDetails)

    const auditDoc = {
        userId: resolvedUser,
        action: actionSettings.action,
        resourceType: actionSettings.resourceType,
        details: sanitizedDetails,
        success,
        ipAddress: details.ipAddress || requestMetadata.ipAddress,
        userAgent: details.userAgent || requestMetadata.userAgent,
        deviceFingerprint: details.deviceFingerprint || requestMetadata.deviceFingerprint,
        riskLevel: determineRiskLevel(actionSettings, success, details)
    }

    const sessionId = details.sessionId || requestMetadata.sessionId
    if (sessionId) {
        auditDoc.sessionId = sessionId
    }

    const errorMessage = buildErrorMessage(details)
    if (!success && errorMessage) {
        auditDoc.errorMessage = errorMessage
    }

    if (details.resourceId) {
        auditDoc.resourceId = details.resourceId
    }

    if (details.electionId) {
        auditDoc.electionId = details.electionId
    }

    if (details.positionId) {
        auditDoc.positionId = details.positionId
    }

    if (details.voteId) {
        auditDoc.voteId = details.voteId
    }

    if (details.duration !== undefined) {
        auditDoc.duration = details.duration
    }

    if (details.location) {
        auditDoc.location = details.location
    }

    if (typeof details.riskScore === 'number') {
        auditDoc.riskScore = details.riskScore
    }

    const additionalData = {
        source: 'auditLogService.logSecurityAction',
        severity: actionSettings.severity,
        success
    }

    if (details.additionalData) {
        additionalData.context = details.additionalData
    }

    const metadata = buildMetadata(requestMetadata, additionalData)
    if (metadata) {
        auditDoc.metadata = metadata
    }

    await persistAuditLog(auditDoc)

    winstonLogger.logSecurity(eventType || 'SECURITY_EVENT', {
        userId: userId || 'anonymous',
        success,
        ...sanitizedDetails
    })
}

const mapAdminAction = (action) => {
    if (!action) {
        return {
            action: 'CUSTOM_ACTION',
            resourceType: 'SYSTEM',
            riskLevel: 'LOW'
        }
    }

    const method = action.split(' ')[0]?.toUpperCase()

    const isSensitive = ['DELETE', 'PATCH', 'PUT'].includes(method)

    return {
        action: 'CUSTOM_ACTION',
        resourceType: 'SYSTEM',
        riskLevel: isSensitive ? 'MEDIUM' : 'LOW'
    }
}

const logAdminAction = async (userId, action, details = {}, success = true, req) => {
    const resolvedUser = resolveUserId(userId)
    const actionSettings = mapAdminAction(action)
    const requestMetadata = extractRequestMetadata(req)

    const payloadDetails = {
        ...details,
        adminAction: action,
        success
    }

    const sanitizedDetails = sanitizeDetails(payloadDetails)

    const auditDoc = {
        userId: resolvedUser,
        action: actionSettings.action,
        resourceType: actionSettings.resourceType,
        details: sanitizedDetails,
        success,
        ipAddress: details.ipAddress || requestMetadata.ipAddress,
        userAgent: details.userAgent || requestMetadata.userAgent,
        deviceFingerprint: details.deviceFingerprint || requestMetadata.deviceFingerprint,
        riskLevel: success ? actionSettings.riskLevel : 'HIGH'
    }

    const sessionId = details.sessionId || requestMetadata.sessionId
    if (sessionId) {
        auditDoc.sessionId = sessionId
    }

    const errorMessage = buildErrorMessage(details)
    if (!success && errorMessage) {
        auditDoc.errorMessage = errorMessage
    }

    if (details.resourceType) {
        auditDoc.resourceType = details.resourceType
    }

    if (details.resourceId) {
        auditDoc.resourceId = details.resourceId
    }

    if (details.duration !== undefined) {
        auditDoc.duration = details.duration
    }

    const metadata = buildMetadata(requestMetadata, {
        source: 'auditLogService.logAdminAction',
        adminAction: action,
        success
    })

    if (metadata) {
        auditDoc.metadata = metadata
    }

    await persistAuditLog(auditDoc)

    winstonLogger.logAudit('admin_action', userId || 'anonymous', {
        success,
        ...sanitizedDetails
    })
}

module.exports = {
    logSecurityAction,
    logAdminAction
}


