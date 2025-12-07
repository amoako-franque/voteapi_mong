const winstonLogger = require('../utils/winstonLogger')
const logger = require('../utils/logger')
const {
    fromMongooseError,
    fromJWTError,
    fromMulterError,
    fromAxiosError,
    formatErrorResponse,
    createExternalServiceError,
    createInternalServerError,
    createValidationError,
    createSecurityError,
    createSuspiciousActivityError,
    createNotFoundError
} = require('../utils/errors')

// Environment checks
const isDevelopment = process.env.NODE_ENV === 'development'
const isProduction = process.env.NODE_ENV === 'production'

/**
 * Check if error is security-related
 * @param {Error} error - Error object
 * @returns {boolean} True if security-related
 */
const isSecurityError = (error) => {
    const securityPatterns = [
        /sql injection/i,
        /xss/i,
        /csrf/i,
        /injection/i,
        /script/i,
        /eval/i,
        /exec/i,
        /command injection/i,
        /path traversal/i,
        /directory traversal/i
    ]

    const errorString = JSON.stringify(error).toLowerCase()
    return securityPatterns.some(pattern => pattern.test(errorString))
}

/**
 * Process and categorize errors
 * @param {Error} error - Error object
 * @returns {Error} Processed error
 */
const processError = (error) => {
    // If it's already our custom error, return as is
    if (error instanceof Error && error.statusCode) {
        return error
    }

    // Handle specific error types
    if (error.name === 'ValidationError' && error.errors) {
        return fromMongooseError(error)
    }

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return fromJWTError(error)
    }

    if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT') {
        return fromMulterError(error)
    }

    if (error.isAxiosError) {
        return fromAxiosError(error)
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return createExternalServiceError('Database', 'Connection failed')
    }

    if (error.code === 'ENOENT') {
        return createInternalServerError('File not found')
    }

    if (error.code === 'EACCES') {
        return createInternalServerError('Permission denied')
    }

    // Handle syntax errors
    if (error instanceof SyntaxError) {
        return createValidationError('Invalid JSON syntax')
    }

    // Handle security-related errors
    if (isSecurityError(error)) {
        return createSecurityError(error.message, 'high')
    }

    // Default to internal server error
    return createInternalServerError(error.message || 'An unexpected error occurred')
}

/**
 * Comprehensive error logging
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 */
const logError = (error, req) => {
    const errorContext = {
        url: req?.url,
        method: req?.method,
        ip: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.headers?.['user-agent'],
        userId: req?.user?.id,
        sessionId: req?.sessionID,
        timestamp: new Date().toISOString(),
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            statusCode: error.statusCode
        }
    }

    // Log based on error severity
    if (error.statusCode >= 500) {
        winstonLogger.logError(error, errorContext)
        logger.error(errorContext, `Server Error: ${ error.message }`)
    } else if (error.statusCode >= 400) {
        winstonLogger.warn({
            type: 'client_error',
            ...errorContext
        }, `Client Error: ${ error.message }`)
        logger.warn(errorContext, `Client Error: ${ error.message }`)
    } else {
        winstonLogger.info({
            type: 'application_error',
            ...errorContext
        }, `Application Error: ${ error.message }`)
        logger.info(errorContext, `Application Error: ${ error.message }`)
    }

    // Log security events
    if (isSecurityError(error)) {
        winstonLogger.logSecurity('security_error', {
            error: error.message,
            context: errorContext
        })
    }
}

/**
 * Main error handler middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleError = (error, req, res, next) => {
    // Capture error in Sentry if enabled
    if (process.env.SENTRY_ENABLED === 'true') {
        const Sentry = require('@sentry/node')
        Sentry.captureException(error, {
            tags: {
                route: req.path,
                method: req.method
            },
            extra: {
                userId: req.user?.id,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            }
        })
    }
    // Log the error
    logError(error, req)

    // Convert unknown errors to known error types
    const processedError = processError(error)

    // Format response
    const response = formatErrorResponse(processedError, isDevelopment)

    // Send response
    res.status(processedError.statusCode).json(response)
}

/**
 * 404 handler middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleNotFound = (req, res) => {
    const error = createNotFoundError(`Route ${ req.method } ${ req.url }`)

    const logContext = {
        type: '404_error',
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers['user-agent']
    }

    winstonLogger.warn(logContext, `404 - Route not found: ${ req.method } ${ req.url }`)
    logger.warn(logContext, `404 - Route not found: ${ req.method } ${ req.url }`)

    const response = formatErrorResponse(error, isDevelopment)
    res.status(404).json(response)
}

/**
 * Async error wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}

/**
 * Validation error handler
 * @param {Object} errors - Validation errors object
 * @returns {Error} Validation error
 */
const handleValidationError = (errors) => {
    const validationErrors = errors.array()
    const firstError = validationErrors[0]

    return createValidationError(
        firstError.msg,
        firstError.param
    )
}

/**
 * Database error handler
 * @param {Error} error - Database error
 * @returns {Error} Processed database error
 */
const handleDatabaseError = (error) => {
    winstonLogger.logDatabase('error', {
        message: error.message,
        stack: error.stack,
        code: error.code
    })

    return fromMongooseError(error)
}

/**
 * Security event handler
 * @param {string} event - Event name
 * @param {Object} details - Event details
 * @param {Object} req - Express request object
 * @returns {Error} Security error
 */
const handleSecurityEvent = (event, details, req) => {
    const securityContext = {
        event,
        details,
        url: req?.url,
        method: req?.method,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        userId: req?.user?.id,
        timestamp: new Date().toISOString()
    }

    winstonLogger.logSecurity(event, securityContext)

    return createSuspiciousActivityError(event, details)
}

/**
 * Log performance metrics
 * @param {string} operation - Operation name
 * @param {number} duration - Duration in milliseconds
 * @param {Object} details - Additional details
 */
const logPerformance = (operation, duration, details = {}) => {
    winstonLogger.logPerformance(operation, duration, details)
}

/**
 * Log user actions
 * @param {string} action - Action name
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 */
const logUserAction = (action, userId, details = {}) => {
    winstonLogger.logUserAction(action, userId, details)
}

module.exports = {
    handleError,
    handleNotFound,
    asyncHandler,
    handleValidationError,
    handleDatabaseError,
    handleSecurityEvent,
    logPerformance,
    logUserAction,
    processError,
    logError,
    isSecurityError,
    // Environment flags
    isDevelopment,
    isProduction
}
