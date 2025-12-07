const secretCodeService = require('../services/secretCodeService')
const auditLogService = require('../services/auditLogService')
const securityService = require('../services/securityService')
const VoterSecretCode = require('../models/VoterSecretCode')
const VoterElectionAccess = require('../models/VoterElectionAccess')
const SecurityEvent = require('../models/SecurityEvent')
const winstonLogger = require('../utils/winstonLogger')

// State management using Maps
const rateLimitStore = new Map()
const sessionStore = new Map()

const PUBLIC_PATHS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/password/forgot',
    '/api/auth/password/reset',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/health',
    '/api'
]

const isPublicPath = (path) => {
    if (!path) {
        return false
    }

    return PUBLIC_PATHS.some(publicPath => path === publicPath || path.startsWith(`${ publicPath }/`))
}

const runMiddlewareStack = (middlewares, req, res, next, index = 0) => {
    if (index >= middlewares.length) {
        return next()
    }

    const middleware = middlewares[index]

    if (typeof middleware !== 'function') {
        return runMiddlewareStack(middlewares, req, res, next, index + 1)
    }

    try {
        const result = middleware(req, res, (err) => {
            if (err) {
                return next(err)
            }
            runMiddlewareStack(middlewares, req, res, next, index + 1)
        })

        if (result && typeof result.then === 'function') {
            result.catch(next)
        }
    } catch (error) {
        next(error)
    }
}

/**
 * Middleware to validate secret code for voting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateSecretCode = async (req, res, next) => {
    try {
        const { voterId, electionId, positionId, secretCode } = req.body

        if (!voterId || !electionId || !positionId || !secretCode) {
            await auditLogService.logSecurityAction(
                req.user?.id || 'anonymous',
                'SECRET_CODE_VALIDATION_FAILED',
                {
                    reason: 'Missing required fields',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                },
                false,
                req
            )
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: voterId, electionId, positionId, secretCode'
            })
        }

        // Validate secret code
        const validation = await secretCodeService.validateSecretCode(
            voterId,
            electionId,
            positionId,
            secretCode,
            req.ip,
            req.headers['user-agent']
        )

        if (!validation.isValid) {
            await auditLogService.logSecurityAction(
                req.user?.id || 'anonymous',
                'SECRET_CODE_VALIDATION_FAILED',
                {
                    reason: 'Invalid secret code',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                },
                false,
                req
            )
            return res.status(401).json({
                success: false,
                message: 'Invalid secret code or already voted for this position'
            })
        }

        // Add secret code info to request
        req.secretCode = validation.secretCode
        req.voterId = voterId
        req.electionId = electionId
        req.positionId = positionId

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'validateSecretCode', req: req.body })

        await auditLogService.logSecurityAction(
            req.user?.id || 'anonymous',
            'SECRET_CODE_VALIDATION_ERROR',
            {
                error: error.message,
                voterId: req.body.voterId,
                electionId: req.body.electionId,
                positionId: req.body.positionId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            },
            false,
            req
        )

        res.status(500).json({
            success: false,
            message: 'Secret code validation failed'
        })
    }
}

/**
 * Middleware to check voter eligibility
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkVoterEligibility = async (req, res, next) => {
    try {
        const { voterId, electionId, positionId } = req.body

        // Check voter election access
        const voterAccess = await VoterElectionAccess.findByVoterAndElection(voterId, electionId)

        if (!voterAccess || !voterAccess.isActive || voterAccess.status !== 'ACTIVE') {
            await auditLogService.logSecurityAction(
                req.user?.id || 'anonymous',
                'VOTER_ELIGIBILITY_CHECK_FAILED',
                {
                    reason: 'Voter access not found or inactive',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                },
                false,
                req
            )
            return res.status(403).json({
                success: false,
                message: 'Voter not eligible for this election'
            })
        }

        // Check if voter can vote for this position
        if (!voterAccess.canVoteForPosition(positionId)) {
            await auditLogService.logSecurityAction(
                req.user?.id || 'anonymous',
                'VOTER_ELIGIBILITY_CHECK_FAILED',
                {
                    reason: 'Cannot vote for this position',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                },
                false,
                req
            )
            return res.status(403).json({
                success: false,
                message: 'Cannot vote for this position'
            })
        }

        req.voterAccess = voterAccess
        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'checkVoterEligibility', req: req.body })

        await auditLogService.logSecurityAction(
            req.user?.id || 'anonymous',
            'VOTER_ELIGIBILITY_CHECK_ERROR',
            {
                error: error.message,
                voterId: req.body.voterId,
                electionId: req.body.electionId,
                positionId: req.body.positionId,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            },
            false,
            req
        )

        res.status(500).json({
            success: false,
            message: 'Voter eligibility check failed'
        })
    }
}

/**
 * Middleware factory for rate limiting
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxRequests - Maximum requests per window
 * @returns {Function} Express middleware function
 */
const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    return async (req, res, next) => {
        try {
            const key = `${ req.ip }-${ req.user?.id || 'anonymous' }`
            const now = Date.now()
            const windowStart = now - windowMs

            // Clean old entries
            if (rateLimitStore.has(key)) {
                const requests = rateLimitStore.get(key).filter(time => time > windowStart)
                rateLimitStore.set(key, requests)
            } else {
                rateLimitStore.set(key, [])
            }

            const requests = rateLimitStore.get(key)

            if (requests.length >= maxRequests) {
                await auditLogService.logSecurityAction(
                    req.user?.id || 'anonymous',
                    'RATE_LIMIT_EXCEEDED',
                    {
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent'],
                        requests: requests.length,
                        maxRequests,
                        windowMs
                    },
                    false,
                    req
                )

                return res.status(429).json({
                    success: false,
                    message: 'Too many requests. Please try again later.',
                    retryAfter: Math.ceil(windowMs / 1000)
                })
            }

            // Add current request
            requests.push(now)
            rateLimitStore.set(key, requests)

            next()
        } catch (error) {
            winstonLogger.logError(error, { action: 'rateLimit' })
            next() // Continue on error to avoid blocking legitimate requests
        }
    }
}

/**
 * Middleware for session management
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const sessionManagement = async (req, res, next) => {
    try {
        const sessionId = req.sessionID || req.headers['x-session-id']

        if (!sessionId) {
            return res.status(401).json({
                success: false,
                message: 'Session required'
            })
        }

        // Check session validity
        const sessionData = sessionStore.get(sessionId)
        const now = Date.now()
        const sessionTimeout = 30 * 60 * 1000 // 30 minutes

        if (!sessionData || (now - sessionData.lastActivity) > sessionTimeout) {
            if (sessionData) {
                sessionStore.delete(sessionId)
            }

            await auditLogService.logSecurityAction(
                req.user?.id || 'anonymous',
                'SESSION_EXPIRED',
                {
                    sessionId,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent']
                },
                false,
                req
            )

            return res.status(401).json({
                success: false,
                message: 'Session expired'
            })
        }

        // Update last activity
        sessionData.lastActivity = now
        sessionStore.set(sessionId, sessionData)

        req.sessionData = sessionData
        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'sessionManagement' })
        next() // Continue on error
    }
}

/**
 * Middleware for device fingerprinting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const deviceFingerprinting = async (req, res, next) => {
    try {
        const deviceFingerprint = securityService.generateDeviceFingerprint(req)

        if (req.user?.id) {
            const userSessions = Array.from(sessionStore.values())
                .filter(session => session.userId === req.user.id)

            const knownDevices = userSessions.map(session => session.deviceFingerprint)

            if (knownDevices.length > 0 && !knownDevices.includes(deviceFingerprint)) {
                await auditLogService.logSecurityAction(
                    req.user.id,
                    'DEVICE_FINGERPRINT_MISMATCH',
                    {
                        deviceFingerprint,
                        knownDevices,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    },
                    true,
                    req
                )
            }
        }

        req.deviceFingerprint = deviceFingerprint
        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'deviceFingerprinting' })
        next()
    }
}

/**
 * Middleware for input sanitization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const inputSanitization = (req, res, next) => {
    try {
        // Preserve password fields for validation and hashing
        const passwordFields = ['password', 'currentPassword', 'newPassword', 'confirmPassword']
        const preservedPasswords = {}

        if (req.body) {
            passwordFields.forEach(field => {
                if (req.body[field]) {
                    preservedPasswords[field] = req.body[field]
                }
            })
            req.body = securityService.sanitizeObject(req.body)
            // Restore password fields after sanitization
            Object.assign(req.body, preservedPasswords)
        }

        if (req.query) {
            req.query = securityService.sanitizeObject(req.query)
        }

        if (req.params) {
            req.params = securityService.sanitizeObject(req.params)
        }

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'inputSanitization' })
        next()
    }
}

/**
 * Middleware for setting security headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const securityHeaders = (req, res, next) => {
    try {
        const headers = securityService.getSecurityHeaders()

        Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value)
        })

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'securityHeaders' })
        next()
    }
}

/**
 * Middleware for admin action logging
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const adminActionLogging = async (req, res, next) => {
    try {
        const originalSend = res.send

        res.send = function (data) {
            if (req.user && req.user.role && req.user.role.includes('ADMIN')) {
                auditLogService.logAdminAction(
                    req.user.id,
                    `${ req.method } ${ req.path }`,
                    {
                        method: req.method,
                        path: req.path,
                        body: req.body,
                        query: req.query,
                        params: req.params,
                        statusCode: res.statusCode,
                        ipAddress: req.ip,
                        userAgent: req.headers['user-agent']
                    },
                    res.statusCode < 400,
                    req
                ).catch(error => {
                    winstonLogger.logError(error, { action: 'adminActionLogging' })
                })
            }

            originalSend.call(this, data)
        }

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'adminActionLogging' })
        next()
    }
}

/**
 * Check for failed login attempts
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Detection result
 */
const checkFailedAttempts = async (req) => {
    try {
        const key = `failed-${ req.ip }`
        const now = Date.now()
        const windowMs = 15 * 60 * 1000

        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, [])
        }

        const failedAttempts = rateLimitStore.get(key)
        const recentAttempts = failedAttempts.filter(time => time > now - windowMs)

        if (recentAttempts.length >= 5) {
            return {
                isSuspicious: true,
                type: 'MULTIPLE_FAILED_ATTEMPTS',
                severity: 'HIGH',
                details: {
                    failedAttempts: recentAttempts.length,
                    windowMs,
                    ipAddress: req.ip
                }
            }
        }

        return { isSuspicious: false }
    } catch (error) {
        winstonLogger.logError(error, { action: 'checkFailedAttempts' })
        return { isSuspicious: false }
    }
}

/**
 * Check for unusual timing patterns
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Detection result
 */
const checkUnusualTiming = async (req) => {
    try {
        const hour = new Date().getHours()
        const isOffHours = hour < 6 || hour > 22

        if (isOffHours && req.user?.role?.includes('ADMIN')) {
            return {
                isSuspicious: true,
                type: 'UNUSUAL_TIMING',
                severity: 'MEDIUM',
                details: {
                    hour,
                    isOffHours,
                    userRole: req.user.role
                }
            }
        }

        return { isSuspicious: false }
    } catch (error) {
        winstonLogger.logError(error, { action: 'checkUnusualTiming' })
        return { isSuspicious: false }
    }
}

/**
 * Check for geographic anomalies
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Detection result
 */
const checkGeographicAnomalies = async (req) => {
    try {
        // Placeholder for future implementation
        return { isSuspicious: false }
    } catch (error) {
        winstonLogger.logError(error, { action: 'checkGeographicAnomalies' })
        return { isSuspicious: false }
    }
}

/**
 * Check for rapid requests
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Detection result
 */
const checkRapidRequests = async (req) => {
    try {
        const key = `rapid-${ req.ip }`
        const now = Date.now()
        const windowMs = 60 * 1000

        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, [])
        }

        const requests = rateLimitStore.get(key)
        const recentRequests = requests.filter(time => time > now - windowMs)

        if (recentRequests.length >= 20) {
            return {
                isSuspicious: true,
                type: 'RAPID_REQUESTS',
                severity: 'MEDIUM',
                details: {
                    requests: recentRequests.length,
                    windowMs,
                    ipAddress: req.ip
                }
            }
        }

        return { isSuspicious: false }
    } catch (error) {
        winstonLogger.logError(error, { action: 'checkRapidRequests' })
        return { isSuspicious: false }
    }
}

/**
 * Create security event in database
 * @param {Object} req - Express request object
 * @param {Object} detectionResult - Detection result object
 */
const createSecurityEvent = async (req, detectionResult) => {
    try {
        const securityEvent = new SecurityEvent({
            eventType: detectionResult.type,
            severity: detectionResult.severity,
            description: `Suspicious activity detected: ${ detectionResult.type }`,
            details: detectionResult.details,
            userId: req.user?.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            deviceFingerprint: req.deviceFingerprint
        })

        await securityEvent.save()

        winstonLogger.warn(`Security event created: ${ detectionResult.type }`, {
            securityEventId: securityEvent._id,
            userId: req.user?.id,
            ipAddress: req.ip
        })
    } catch (error) {
        winstonLogger.logError(error, { action: 'createSecurityEvent', detectionResult })
    }
}

/**
 * Middleware for suspicious activity detection
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const suspiciousActivityDetection = async (req, res, next) => {
    try {
        const suspiciousPatterns = [
            () => checkFailedAttempts(req),
            () => checkUnusualTiming(req),
            () => checkGeographicAnomalies(req),
            () => checkRapidRequests(req)
        ]

        for (const check of suspiciousPatterns) {
            const result = await check()
            if (result.isSuspicious) {
                await createSecurityEvent(req, result)
            }
        }

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'suspiciousActivityDetection' })
        next()
    }
}

/**
 * Middleware to validate vote integrity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateVoteIntegrity = async (req, res, next) => {
    try {
        const { voteId } = req.params

        if (!voteId) {
            return res.status(400).json({
                success: false,
                message: 'Vote ID required'
            })
        }

        next()
    } catch (error) {
        winstonLogger.logError(error, { action: 'validateVoteIntegrity' })
        next()
    }
}

/**
 * Middleware factory to validate election phase
 * @param {string} requiredPhase - Required election phase
 * @returns {Function} Express middleware function
 */
const validateElectionPhase = (requiredPhase) => {
    return async (req, res, next) => {
        try {
            const { electionId } = req.body

            if (!electionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Election ID required'
                })
            }

            // Note: Phase validation logic would go here
            // For now, just pass through
            next()
        } catch (error) {
            winstonLogger.logError(error, { action: 'validateElectionPhase' })
            next()
        }
    }
}

/**
 * Clear rate limit store (utility function)
 */
const clearRateLimitStore = () => {
    rateLimitStore.clear()
}

/**
 * Clear session store (utility function)
 */
const clearSessionStore = () => {
    sessionStore.clear()
}

/**
 * Get rate limit store size (utility function)
 * @returns {number} Store size
 */
const getRateLimitStoreSize = () => {
    return rateLimitStore.size
}

/**
 * Get session store size (utility function)
 * @returns {number} Store size
 */
const getSessionStoreSize = () => {
    return sessionStore.size
}

const defaultRateLimiter = rateLimit()

const publicAuthMiddlewareStack = [
    defaultRateLimiter,
    inputSanitization,
    securityHeaders
]

const defaultSecurityMiddlewareStack = [
    defaultRateLimiter,
    sessionManagement,
    deviceFingerprinting,
    inputSanitization,
    securityHeaders,
    suspiciousActivityDetection,
    adminActionLogging
]

const combinedSecurityMiddleware = (req, res, next) => {
    const stack = isPublicPath(req.path)
        ? publicAuthMiddlewareStack
        : defaultSecurityMiddlewareStack

    runMiddlewareStack(stack, req, res, next)
}

module.exports = {
    // Main middleware functions
    validateSecretCode,
    checkVoterEligibility,
    rateLimit,
    sessionManagement,
    deviceFingerprinting,
    inputSanitization,
    securityHeaders,
    adminActionLogging,
    suspiciousActivityDetection,
    validateVoteIntegrity,
    validateElectionPhase,
    combinedSecurityMiddleware,

    // Detection functions
    checkFailedAttempts,
    checkUnusualTiming,
    checkGeographicAnomalies,
    checkRapidRequests,
    createSecurityEvent,

    // Utility functions
    clearRateLimitStore,
    clearSessionStore,
    getRateLimitStoreSize,
    getSessionStoreSize
}
