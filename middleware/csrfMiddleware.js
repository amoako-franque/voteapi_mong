const csrf = require('csurf')
const crypto = require('crypto')
const logger = require('../utils/logger')

/**
 * Custom CSRF token generator that creates unique tokens with 3-4 character prefix
 * Format: [PREFIX][TIMESTAMP][RANDOM]
 * Example: ABC1703123456789xyz123def456
 */
const generateCustomToken = (req, res, next) => {
    // Generate a 3-4 character prefix (random letters)
    const prefixes = ['ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQR', 'STU', 'VWX', 'YZ1', '234', '567', '890']
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]

    const timestamp = Date.now().toString()

    const randomSuffix = crypto.randomBytes(16).toString('hex')

    const customToken = `${ prefix }${ timestamp }${ randomSuffix }`

    req.customCsrfToken = customToken

    next()
}

/**
 * CSRF middleware configuration with custom token generation
 */
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
    },
    value: (req) => {
        // Use our custom token if available, otherwise let csurf generate one
        return req.customCsrfToken || req.body._csrf || req.query._csrf || req.headers['csrf-token']
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    sessionKey: 'session'
})

/**
 * Enhanced CSRF middleware with logging and error handling
 */
const csrfMiddleware = (req, res, next) => {
    generateCustomToken(req, res, (err) => {
        if (err) {
            logger.error({
                type: 'csrf_token_generation_error',
                error: err.message,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                url: req.url,
                method: req.method
            }, 'Failed to generate CSRF token')
            return next(err)
        }

        csrfProtection(req, res, (err) => {
            if (err) {
                logger.logSecurityEvent('csrf_violation', {
                    ip: req.ip,
                    userAgent: req.headers['user-agent'],
                    url: req.url,
                    method: req.method,
                    providedToken: req.body._csrf || req.query._csrf || req.headers['csrf-token'],
                    expectedToken: req.csrfToken(),
                    error: err.message
                })

                return res.status(403).json({
                    success: false,
                    error: 'CSRF token mismatch',
                    message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
                    code: 'CSRF_TOKEN_MISMATCH',
                    timestamp: new Date().toISOString()
                })
            }

            res.setHeader('X-CSRF-Token', req.csrfToken())

            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                logger.info({
                    type: 'csrf_validation_success',
                    ip: req.ip,
                    url: req.url,
                    method: req.method,
                    tokenPrefix: req.csrfToken().substring(0, 3)
                }, 'CSRF token validated successfully')
            }

            next()
        })
    })
}

/**
 * Middleware to skip CSRF protection for specific routes
 * Use this for API endpoints that don't need CSRF protection
 */
const skipCsrf = (req, res, next) => {
    next()
}

/**
 * Middleware to provide CSRF token without validation
 * Use this for GET requests that need to provide the token to clients
 */
const provideCsrfToken = (req, res, next) => {
    generateCustomToken(req, res, (err) => {
        if (err) {
            return next(err)
        }

        res.locals.csrfToken = req.customCsrfToken
        res.setHeader('X-CSRF-Token', req.customCsrfToken)

        next()
    })
}

/**
 * Helper function to check if a route should be exempt from CSRF
 */
const isCsrfExempt = (path, method, req = null) => {
    const exemptPaths = [
        '/health',
        '/api/health',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/password/forgot',
        '/api/auth/password/reset',
        '/api/auth/refresh',
        '/api/auth/logout',
        '/api/webhooks',
        '/api/public',
        '/api/status'
    ]

    const exemptMethods = ['GET', 'HEAD', 'OPTIONS']

    // Skip CSRF for API clients using JWT tokens (Authorization header)
    // CSRF protection is primarily for browser-based requests with cookies
    if (req && req.headers && req.headers.authorization) {
        return true
    }

    // Skip CSRF for API routes when using API key or Bearer token
    if (req && req.headers && (req.headers['x-api-key'] || req.headers['api-key'])) {
        return true
    }

    const isExemptPath = exemptPaths.some(exemptPath => {
        if (exemptPath.includes('*')) {
            const pattern = exemptPath.replace(/\*/g, '.*')
            return new RegExp(`^${ pattern }$`).test(path)
        }
        return path.startsWith(exemptPath)
    })

    return isExemptPath || exemptMethods.includes(method)
}

module.exports = {
    csrfMiddleware,
    skipCsrf,
    provideCsrfToken,
    isCsrfExempt,
    generateCustomToken
}
