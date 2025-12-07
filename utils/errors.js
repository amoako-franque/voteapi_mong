const winstonLogger = require('./winstonLogger')

/**
 * Generate error code
 * @param {string} name - Error name
 * @returns {string} Error code
 */
const generateErrorCode = (name) => {
    return `${ name.toUpperCase() }_${ Date.now() }`
}

/**
 * Create base app error
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {boolean} isOperational - Is operational error
 * @param {string} code - Error code
 * @param {Object} additionalProps - Additional properties
 * @returns {Error} Error object
 */
const createAppError = (message, statusCode = 500, isOperational = true, code = null, additionalProps = {}) => {
    const error = new Error(message)
    error.name = 'AppError'
    error.statusCode = statusCode
    error.isOperational = isOperational
    error.code = code || generateErrorCode('APP_ERROR')
    error.timestamp = new Date().toISOString()

    // Add additional properties
    Object.assign(error, additionalProps)

    Error.captureStackTrace(error, createAppError)
    return error
}

/**
 * Create validation error
 * @param {string} message - Error message
 * @param {string} field - Field name
 * @returns {Error} Validation error
 */
const createValidationError = (message, field = null) => {
    return createAppError(message, 400, true, 'VALIDATION_ERROR', {
        name: 'ValidationError',
        field,
        type: 'validation'
    })
}

/**
 * Create authentication error
 * @param {string} message - Error message
 * @returns {Error} Authentication error
 */
const createAuthenticationError = (message = 'Authentication failed') => {
    return createAppError(message, 401, true, 'AUTH_ERROR', {
        name: 'AuthenticationError',
        type: 'authentication'
    })
}

/**
 * Create authorization error
 * @param {string} message - Error message
 * @returns {Error} Authorization error
 */
const createAuthorizationError = (message = 'Insufficient permissions') => {
    return createAppError(message, 403, true, 'AUTHORIZATION_ERROR', {
        name: 'AuthorizationError',
        type: 'authorization'
    })
}

/**
 * Create not found error
 * @param {string} resource - Resource name
 * @returns {Error} Not found error
 */
const createNotFoundError = (resource = 'Resource') => {
    return createAppError(`${ resource } not found`, 404, true, 'NOT_FOUND', {
        name: 'NotFoundError',
        type: 'not_found',
        resource
    })
}

/**
 * Create conflict error
 * @param {string} message - Error message
 * @returns {Error} Conflict error
 */
const createConflictError = (message = 'Resource conflict') => {
    return createAppError(message, 409, true, 'CONFLICT_ERROR', {
        name: 'ConflictError',
        type: 'conflict'
    })
}

/**
 * Create rate limit error
 * @param {string} message - Error message
 * @returns {Error} Rate limit error
 */
const createRateLimitError = (message = 'Too many requests') => {
    return createAppError(message, 429, true, 'RATE_LIMIT_ERROR', {
        name: 'RateLimitError',
        type: 'rate_limit'
    })
}

/**
 * Create database error
 * @param {string} message - Error message
 * @param {Error} originalError - Original error
 * @returns {Error} Database error
 */
const createDatabaseError = (message = 'Database operation failed', originalError = null) => {
    const error = createAppError(message, 500, false, 'DATABASE_ERROR', {
        name: 'DatabaseError',
        type: 'database',
        originalError
    })

    // Log database error
    winstonLogger.logDatabase('error', {
        message: error.message,
        originalError: originalError?.message,
        stack: error.stack
    })

    return error
}

/**
 * Create external service error
 * @param {string} service - Service name
 * @param {string} message - Error message
 * @returns {Error} External service error
 */
const createExternalServiceError = (service, message = 'External service error') => {
    return createAppError(`${ service }: ${ message }`, 502, false, 'EXTERNAL_SERVICE_ERROR', {
        name: 'ExternalServiceError',
        type: 'external_service',
        service
    })
}

/**
 * Create internal server error
 * @param {string} message - Error message
 * @returns {Error} Internal server error
 */
const createInternalServerError = (message = 'Internal server error') => {
    return createAppError(message, 500, false, 'INTERNAL_SERVER_ERROR', {
        name: 'InternalServerError',
        type: 'internal_server'
    })
}

/**
 * Create configuration error
 * @param {string} message - Error message
 * @returns {Error} Configuration error
 */
const createConfigurationError = (message = 'Configuration error') => {
    return createAppError(message, 500, false, 'CONFIGURATION_ERROR', {
        name: 'ConfigurationError',
        type: 'configuration'
    })
}

/**
 * Create security error
 * @param {string} message - Error message
 * @param {string} severity - Severity level
 * @returns {Error} Security error
 */
const createSecurityError = (message = 'Security violation', severity = 'medium') => {
    const error = createAppError(message, 403, true, 'SECURITY_ERROR', {
        name: 'SecurityError',
        type: 'security',
        severity
    })

    // Log security error
    winstonLogger.logSecurity('security_violation', {
        message: error.message,
        severity: severity,
        stack: error.stack
    })

    return error
}

/**
 * Create suspicious activity error
 * @param {string} activity - Activity description
 * @param {Object} details - Activity details
 * @returns {Error} Suspicious activity error
 */
const createSuspiciousActivityError = (activity, details = {}) => {
    return createSecurityError(`Suspicious activity detected: ${ activity }`, 'high', {
        name: 'SuspiciousActivityError',
        activity,
        details,
        statusCode: 403,
        code: 'SUSPICIOUS_ACTIVITY'
    })
}

/**
 * Create business logic error
 * @param {string} message - Error message
 * @param {string} businessRule - Business rule
 * @returns {Error} Business logic error
 */
const createBusinessLogicError = (message, businessRule = null) => {
    return createAppError(message, 422, true, 'BUSINESS_LOGIC_ERROR', {
        name: 'BusinessLogicError',
        type: 'business_logic',
        businessRule
    })
}

/**
 * Create resource exhausted error
 * @param {string} resource - Resource name
 * @param {string} message - Error message
 * @returns {Error} Resource exhausted error
 */
const createResourceExhaustedError = (resource, message = 'Resource exhausted') => {
    return createAppError(`${ resource }: ${ message }`, 507, true, 'RESOURCE_EXHAUSTED', {
        name: 'ResourceExhaustedError',
        type: 'resource_exhausted',
        resource
    })
}

// Error Factory Functions

/**
 * Create error from Mongoose error
 * @param {Error} error - Mongoose error
 * @returns {Error} Formatted error
 */
const fromMongooseError = (error) => {
    if (error.name === 'ValidationError') {
        const field = Object.keys(error.errors)[0]
        return createValidationError(error.errors[field].message, field)
    }

    if (error.name === 'CastError') {
        return createValidationError(`Invalid ${ error.path }: ${ error.value }`)
    }

    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0]
        return createConflictError(`${ field } already exists`)
    }

    return createDatabaseError('Database operation failed', error)
}

/**
 * Create error from JWT error
 * @param {Error} error - JWT error
 * @returns {Error} Formatted error
 */
const fromJWTError = (error) => {
    if (error.name === 'TokenExpiredError') {
        return createAuthenticationError('Token has expired')
    }

    if (error.name === 'JsonWebTokenError') {
        return createAuthenticationError('Invalid token')
    }

    return createAuthenticationError('Token verification failed')
}

/**
 * Create error from Multer error
 * @param {Error} error - Multer error
 * @returns {Error} Formatted error
 */
const fromMulterError = (error) => {
    switch (error.code) {
        case 'LIMIT_FILE_SIZE':
            return createValidationError('File too large')
        case 'LIMIT_FILE_COUNT':
            return createValidationError('Too many files')
        case 'LIMIT_UNEXPECTED_FILE':
            return createValidationError('Unexpected field name')
        default:
            return createValidationError('File upload error')
    }
}

/**
 * Create error from Axios error
 * @param {Error} error - Axios error
 * @returns {Error} Formatted error
 */
const fromAxiosError = (error) => {
    if (error.response) {
        const status = error.response.status
        const message = error.response.data?.message || 'External service error'

        if (status >= 400 && status < 500) {
            return createExternalServiceError('External API', message)
        }

        return createExternalServiceError('External API', message)
    }

    if (error.request) {
        return createExternalServiceError('External API', 'Service unavailable')
    }

    return createExternalServiceError('External API', 'Network error')
}

/**
 * Format error for response
 * @param {Error} error - Error object
 * @param {boolean} isDevelopment - Is development environment
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (error, isDevelopment = false) => {
    const baseResponse = {
        success: false,
        error: {
            type: error.type || 'unknown',
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message,
            timestamp: error.timestamp || new Date().toISOString()
        }
    }

    // Add additional fields for specific error types
    if (error.field) {
        baseResponse.error.field = error.field
    }

    if (error.resource) {
        baseResponse.error.resource = error.resource
    }

    if (error.businessRule) {
        baseResponse.error.businessRule = error.businessRule
    }

    // Add stack trace in development
    if (isDevelopment && error.stack) {
        baseResponse.error.stack = error.stack
    }

    // Add retry information for rate limits
    if (error.type === 'rate_limit') {
        baseResponse.error.retryAfter = 15 * 60 // 15 minutes
    }

    return baseResponse
}

module.exports = {
    // Base error
    createAppError,

    // User errors (4xx)
    createValidationError,
    createAuthenticationError,
    createAuthorizationError,
    createNotFoundError,
    createConflictError,
    createRateLimitError,

    // Server errors (5xx)
    createDatabaseError,
    createExternalServiceError,
    createInternalServerError,
    createConfigurationError,

    // Security errors
    createSecurityError,
    createSuspiciousActivityError,

    // Business logic errors
    createBusinessLogicError,
    createResourceExhaustedError,

    // Error factory functions
    fromMongooseError,
    fromJWTError,
    fromMulterError,
    fromAxiosError,

    // Response formatter
    formatErrorResponse,

    // Utility
    generateErrorCode
}
