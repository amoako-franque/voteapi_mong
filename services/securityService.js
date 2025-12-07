const securityConfig = require('../config/security')
const winstonLogger = require('../utils/winstonLogger')

const DEFAULT_SANITIZE_OPTIONS = {
    maxDepth: 6,
    maxArrayLength: 100,
    maxStringLength: 5000,
    trimStrings: true,
    redactFields: [],
    redactedReplacement: '[REDACTED]',
    depthExceededValue: '[DEPTH_EXCEEDED]',
    circularValue: '[CIRCULAR]'
}

const DEFAULT_EXTRA_SECURITY_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'X-DNS-Prefetch-Control': 'off',
    'X-Permitted-Cross-Domain-Policies': 'none'
}

const sanitizeForLogging = winstonLogger.sanitizeForLogging || ((value) => value)

const toLowerCase = (value) => {
    return typeof value === 'string' ? value.toLowerCase() : value
}

const resolveSensitiveFields = (additional = []) => {
    const baseFields = securityConfig.auditLog?.sensitiveFields || []
    return new Set([...baseFields, ...additional].map(field => toLowerCase(field)))
}

const resolveClientIp = (req = {}) => {
    const headers = req.headers || {}
    const forwarded = headers['x-forwarded-for']

    if (forwarded) {
        const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
        const forwardedIp = forwardedValue.split(',')[0]?.trim()
        if (forwardedIp) {
            return forwardedIp
        }
    }

    if (req.ip) {
        return req.ip
    }

    if (req.connection?.remoteAddress) {
        return req.connection.remoteAddress
    }

    if (req.socket?.remoteAddress) {
        return req.socket.remoteAddress
    }

    return 'unknown'
}

const sanitizeStringValue = (value, options) => {
    if (typeof value !== 'string') {
        return value
    }

    let sanitized = sanitizeForLogging(value)

    if (typeof sanitized !== 'string') {
        sanitized = sanitized === undefined || sanitized === null ? '' : String(sanitized)
    }

    if (options.trimStrings) {
        sanitized = sanitized.trim()
    }

    if (options.maxStringLength && sanitized.length > options.maxStringLength) {
        sanitized = sanitized.slice(0, options.maxStringLength) + '...'
    }

    return sanitized
}

const toPlainObject = (value) => {
    if (!value || typeof value !== 'object') {
        return value
    }

    if (typeof value.toJSON === 'function') {
        try {
            return value.toJSON()
        } catch (error) {
            winstonLogger.logError(error, { action: 'toPlainObject' })
        }
    }

    if (value instanceof Date) {
        return value.toISOString()
    }

    if (Buffer.isBuffer(value)) {
        return value.toString('base64')
    }

    return value
}

const sanitizeValue = (value, options, sensitiveFields, depth, visited) => {
    if (value === null || value === undefined) {
        return value
    }

    if (depth > options.maxDepth) {
        return options.depthExceededValue
    }

    const plainValue = toPlainObject(value)

    if (typeof plainValue === 'string') {
        return sanitizeStringValue(plainValue, options)
    }

    if (typeof plainValue === 'number' || typeof plainValue === 'boolean') {
        return plainValue
    }

    if (Array.isArray(plainValue)) {
        const sanitizedArray = []
        const limit = options.maxArrayLength ? Math.min(plainValue.length, options.maxArrayLength) : plainValue.length

        for (let index = 0; index < limit; index += 1) {
            sanitizedArray.push(sanitizeValue(plainValue[index], options, sensitiveFields, depth + 1, visited))
        }

        if (plainValue.length > limit) {
            sanitizedArray.push(options.depthExceededValue)
        }

        return sanitizedArray
    }

    if (typeof plainValue === 'object') {
        if (visited.has(plainValue)) {
            return options.circularValue
        }

        visited.add(plainValue)

        const sanitizedObject = {}

        for (const [key, val] of Object.entries(plainValue)) {
            const safeKey = typeof key === 'string' ? key : String(key)
            const lowerKey = toLowerCase(safeKey)

            if (sensitiveFields.has(lowerKey)) {
                sanitizedObject[safeKey] = options.redactedReplacement
                continue
            }

            sanitizedObject[safeKey] = sanitizeValue(val, options, sensitiveFields, depth + 1, visited)
        }

        visited.delete(plainValue)
        return sanitizedObject
    }

    return plainValue
}

const sanitizeObject = (payload, options = {}) => {
    const mergedOptions = {
        ...DEFAULT_SANITIZE_OPTIONS,
        ...options
    }

    const sensitiveFields = resolveSensitiveFields(mergedOptions.redactFields)
    const visited = new WeakSet()

    try {
        return sanitizeValue(payload, mergedOptions, sensitiveFields, 0, visited)
    } catch (error) {
        winstonLogger.logError(error, { action: 'sanitizeObject' })
        return mergedOptions.redactedReplacement
    }
}

const generateDeviceFingerprint = (req = {}) => {
    try {
        const safeRequest = {
            headers: req.headers || {},
            ip: req.ip,
            connection: req.connection
        }

        const baseFingerprint = securityConfig.generateDeviceFingerprint(safeRequest)
        const clientIp = resolveClientIp(req)
        const sessionId = req.sessionID || req.headers?.['x-session-id'] || ''
        const userId = req.user?.id || ''

        const fingerprintSeed = [baseFingerprint, clientIp, sessionId, userId]
            .filter(Boolean)
            .join('|')

        if (!fingerprintSeed) {
            return baseFingerprint || 'anonymous-device'
        }

        return securityConfig.hashData(
            fingerprintSeed,
            securityConfig.deviceFingerprint?.hashAlgorithm || 'sha256'
        )
    } catch (error) {
        winstonLogger.logError(error, { action: 'generateDeviceFingerprint' })
        return 'anonymous-device'
    }
}

const applyDynamicSecurityHeaderOverrides = (headers) => {
    const updatedHeaders = { ...headers }

    const cspReportUri = process.env.CSP_REPORT_URI
    if (cspReportUri) {
        const currentCsp = updatedHeaders['Content-Security-Policy'] || ''
        if (!currentCsp.includes('report-uri')) {
            updatedHeaders['Content-Security-Policy'] = currentCsp
                ? `${ currentCsp }; report-uri ${ cspReportUri }`
                : `report-uri ${ cspReportUri }`
        }
    }

    const reportToEndpoint = process.env.REPORT_TO_ENDPOINT
    if (reportToEndpoint) {
        updatedHeaders['Report-To'] = reportToEndpoint
    }

    const nelPolicy = process.env.NEL_POLICY
    if (nelPolicy) {
        updatedHeaders.NEL = nelPolicy
    }

    return updatedHeaders
}

const getSecurityHeaders = (overrides = {}) => {
    try {
        const baseHeaders = typeof securityConfig.getSecurityHeaders === 'function'
            ? securityConfig.getSecurityHeaders()
            : { ...securityConfig.securityHeaders }

        const mergedHeaders = { ...DEFAULT_EXTRA_SECURITY_HEADERS, ...baseHeaders, ...overrides }
        return applyDynamicSecurityHeaderOverrides(mergedHeaders)
    } catch (error) {
        winstonLogger.logError(error, { action: 'getSecurityHeaders' })
        return { ...DEFAULT_EXTRA_SECURITY_HEADERS, ...overrides }
    }
}

const buildSecurityContext = (req = {}, additional = {}) => {
    return sanitizeObject({
        ipAddress: resolveClientIp(req),
        userAgent: req.headers?.['user-agent'],
        deviceFingerprint: req.deviceFingerprint || generateDeviceFingerprint(req),
        sessionId: req.sessionID || req.headers?.['x-session-id'],
        correlationId: req.headers?.['x-correlation-id'],
        ...additional
    }, {
        redactFields: ['userAgent', 'sessionId'],
        maxDepth: 3
    })
}

module.exports = {
    sanitizeObject,
    generateDeviceFingerprint,
    getSecurityHeaders,
    resolveClientIp,
    buildSecurityContext
}


