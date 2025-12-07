const HTTP_STATUS = require('./constants').HTTP_STATUS
const logger = require('./logger')

/**
 * Success response formatter
 * @param {*} data - Response data
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted success response
 */
const success = (data = null, message = 'Success', statusCode = HTTP_STATUS.OK) => {
    const response = {
        success: true,
        message,
        statusCode,
        data,
        timestamp: new Date().toISOString()
    }

    // Add metadata if data is paginated
    if (data && data.items && Array.isArray(data.items)) {
        response.data = data.items
        response.metadata = {
            totalItems: data.total || data.items.length,
            itemsPerPage: data.limit || data.items.length,
            currentPage: data.page || 1,
            totalPages: data.totalPages || 1
        }
    }

    return response
}

/**
 * Error response formatter
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {*} errors - Error details
 * @returns {Object} Formatted error response
 */
const error = (message = 'An error occurred', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) => {
    const response = {
        success: false,
        message,
        statusCode,
        timestamp: new Date().toISOString()
    }

    // Add error details if provided
    if (errors) {
        response.errors = errors
    }

    return response
}

/**
 * Validation error response
 * @param {*} errors - Validation errors
 * @param {string} message - Error message
 * @returns {Object} Formatted validation error response
 */
const validationError = (errors, message = 'Validation failed') => {
    return error(message, HTTP_STATUS.VALIDATION_ERROR, errors)
}

/**
 * Not found response
 * @param {string} resource - Resource name
 * @param {string} message - Custom message
 * @returns {Object} Formatted not found response
 */
const notFound = (resource = 'Resource', message = null) => {
    const defaultMessage = `${ resource } not found`
    return error(message || defaultMessage, HTTP_STATUS.NOT_FOUND)
}

/**
 * Unauthorized response
 * @param {string} message - Error message
 * @returns {Object} Formatted unauthorized response
 */
const unauthorized = (message = 'Unauthorized access') => {
    return error(message, HTTP_STATUS.UNAUTHORIZED)
}

/**
 * Forbidden response
 * @param {string} message - Error message
 * @returns {Object} Formatted forbidden response
 */
const forbidden = (message = 'Access forbidden') => {
    return error(message, HTTP_STATUS.FORBIDDEN)
}

/**
 * Conflict response
 * @param {string} message - Error message
 * @param {*} errors - Error details
 * @returns {Object} Formatted conflict response
 */
const conflict = (message = 'Resource conflict', errors = null) => {
    return error(message, HTTP_STATUS.CONFLICT, errors)
}

/**
 * Created response
 * @param {*} data - Response data
 * @param {string} message - Response message
 * @returns {Object} Formatted created response
 */
const created = (data, message = 'Resource created successfully') => {
    return success(data, message, HTTP_STATUS.CREATED)
}

/**
 * No content response
 * @param {string} message - Response message
 * @returns {Object} Formatted no content response
 */
const noContent = (message = 'No content') => {
    return success(null, message, HTTP_STATUS.NO_CONTENT)
}

/**
 * Paginated response formatter
 * @param {Array} items - Data items
 * @param {Object} paginationInfo - Pagination information
 * @param {string} message - Response message
 * @returns {Object} Formatted paginated response
 */
const paginated = (items, paginationInfo, message = 'Success') => {
    return {
        success: true,
        message,
        statusCode: HTTP_STATUS.OK,
        data: items,
        pagination: paginationInfo,
        timestamp: new Date().toISOString()
    }
}

/**
 * Send formatted response to Express response object
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Express response
 */
const send = (res, data = null, message = 'Success', statusCode = HTTP_STATUS.OK) => {
    const response = success(data, message, statusCode)
    return res.status(statusCode).json(response)
}

/**
 * Send error response to Express response object
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {*} errors - Error details
 * @returns {Object} Express response
 */
const sendError = (res, message = 'An error occurred', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) => {
    const response = error(message, statusCode, errors)
    return res.status(statusCode).json(response)
}

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} items - Data items
 * @param {Object} paginationInfo - Pagination information
 * @param {string} message - Response message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Express response
 */
const sendPaginated = (res, items, paginationInfo, message = 'Success', statusCode = HTTP_STATUS.OK) => {
    const response = paginated(items, paginationInfo, message)
    return res.status(statusCode).json(response)
}

/**
 * Format database error
 * @param {Error} err - Database error
 * @returns {Object} Formatted error response
 */
const formatDatabaseError = (err) => {
    logger.error({
        err: err,
        message: 'Database error'
    })

    // Common MongoDB errors
    if (err.name === 'ValidationError') {
        const errors = {}
        Object.keys(err.errors).forEach(key => {
            errors[key] = err.errors[key].message
        })
        return validationError(errors, 'Validation error')
    }

    if (err.name === 'MongoServerError') {
        if (err.code === 11000) {
            const duplicateField = Object.keys(err.keyPattern)[0]
            return conflict(`${ duplicateField } already exists`)
        }

        if (err.code === 50) {
            return error('Database operation timeout', HTTP_STATUS.SERVICE_UNAVAILABLE)
        }
    }

    if (err.name === 'CastError') {
        return error('Invalid ID format', HTTP_STATUS.BAD_REQUEST)
    }

    return error('Database error occurred', HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

/**
 * Format validation error
 * @param {Error} err - Validation error
 * @returns {Object} Formatted error response
 */
const formatValidationError = (err) => {
    logger.error({
        err: err,
        message: 'Validation error'
    })

    const errors = {}
    if (err.details && Array.isArray(err.details)) {
        err.details.forEach(detail => {
            const key = detail.path.join('.')
            errors[key] = detail.message
        })
    }

    return validationError(errors, 'Validation error')
}

/**
 * Format JWT error
 * @param {Error} err - JWT error
 * @returns {Object} Formatted error response
 */
const formatJWTError = (err) => {
    logger.error({
        err: err,
        message: 'JWT error'
    })

    if (err.name === 'TokenExpiredError') {
        return error('Token has expired', HTTP_STATUS.UNAUTHORIZED)
    }

    if (err.name === 'JsonWebTokenError') {
        return error('Invalid token', HTTP_STATUS.UNAUTHORIZED)
    }

    return error('Authentication error', HTTP_STATUS.UNAUTHORIZED)
}

/**
 * Format multer error
 * @param {Error} err - Multer error
 * @returns {Object} Formatted error response
 */
const formatMulterError = (err) => {
    logger.error({
        err: err,
        message: 'File upload error'
    })

    if (err.code === 'LIMIT_FILE_SIZE') {
        return error('File too large', HTTP_STATUS.BAD_REQUEST)
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
        return error('Too many files', HTTP_STATUS.BAD_REQUEST)
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return error('Unexpected file field', HTTP_STATUS.BAD_REQUEST)
    }

    return error('File upload error', HTTP_STATUS.BAD_REQUEST)
}

/**
 * Format error from custom error classes
 * @param {Error} err - Custom error
 * @returns {Object} Formatted error response
 */
const formatCustomError = (err) => {
    logger.error({
        err: err,
        message: err.message || 'Custom error'
    })

    const statusCode = err.statusCode || err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR
    const errors = err.errors || null

    return error(err.message || 'An error occurred', statusCode, errors)
}

/**
 * Format any error to appropriate response
 * @param {Error} err - Any error
 * @returns {Object} Formatted error response
 */
const formatError = (err) => {
    // Check if it's a custom error class
    if (err.statusCode || err.status) {
        return formatCustomError(err)
    }

    // Check error type
    if (err.name === 'ValidationError') {
        return formatValidationError(err)
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return formatJWTError(err)
    }

    if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
        return formatMulterError(err)
    }

    if (err.name === 'MongoServerError' || err.name === 'MongoError' || err.name === 'CastError') {
        return formatDatabaseError(err)
    }

    // Default error
    return error(err.message || 'An error occurred', HTTP_STATUS.INTERNAL_SERVER_ERROR)
}

module.exports = {
    success,
    error,
    validationError,
    notFound,
    unauthorized,
    forbidden,
    conflict,
    created,
    noContent,
    paginated,
    send,
    sendError,
    sendPaginated,
    formatDatabaseError,
    formatValidationError,
    formatJWTError,
    formatMulterError,
    formatCustomError,
    formatError
}
