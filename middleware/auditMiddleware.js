const winstonLogger = require('../utils/winstonLogger')

// Configuration constants
const SENSITIVE_OPERATIONS = ['DELETE', 'PUT', 'PATCH']
const SENSITIVE_ENDPOINTS = ['/api/users', '/api/admin', '/api/auth', '/api/config']

/**
 * Middleware to log sensitive requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const logSensitiveRequests = (req, res, next) => {
    const isSensitiveEndpoint = SENSITIVE_ENDPOINTS.some(endpoint =>
        req.url.startsWith(endpoint)
    )

    const isSensitiveOperation = SENSITIVE_OPERATIONS.includes(req.method)

    if (isSensitiveEndpoint || isSensitiveOperation) {
        winstonLogger.logAudit('api_request', req.user?.id || 'anonymous', {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            endpoint: req.url,
            operation: req.method
        })
    }

    next()
}

/**
 * Middleware to log data access (read operations)
 * @param {string} resource - Resource name
 * @returns {Function} Express middleware function
 */
const logDataAccess = (resource) => {
    return (req, res, next) => {
        const originalJson = res.json

        res.json = function (data) {
            winstonLogger.logDataAccess('read', resource, req.user?.id || 'anonymous', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                recordCount: Array.isArray(data) ? data.length : 1,
                resource
            })

            return originalJson.call(this, data)
        }

        next()
    }
}

/**
 * Middleware to log data modification (write operations)
 * @param {string} resource - Resource name
 * @returns {Function} Express middleware function
 */
const logDataModification = (resource) => {
    return (req, res, next) => {
        const originalJson = res.json

        res.json = function (data) {
            const operation = req.method.toLowerCase()

            winstonLogger.logDataAccess(operation, resource, req.user?.id || 'anonymous', {
                method: req.method,
                url: req.url,
                ip: req.ip,
                resource,
                operation,
                dataId: data?.id || data?._id
            })

            return originalJson.call(this, data)
        }

        next()
    }
}

/**
 * Log authentication events
 * @param {string} action - Authentication action
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 */
const logAuthentication = (action, userId, details = {}) => {
    winstonLogger.logAudit(`auth_${ action }`, userId, {
        ...details,
        timestamp: new Date().toISOString()
    })
}

/**
 * Log authorization events
 * @param {string} action - Authorization action
 * @param {string} userId - User ID
 * @param {string} resource - Resource name
 * @param {Object} details - Additional details
 */
const logAuthorization = (action, userId, resource, details = {}) => {
    winstonLogger.logAudit(`authz_${ action }`, userId, {
        resource,
        ...details,
        timestamp: new Date().toISOString()
    })
}

/**
 * Log system events
 * @param {string} event - Event name
 * @param {Object} details - Event details
 */
const logSystemEvent = (event, details = {}) => {
    winstonLogger.logSystemAudit(event, {
        ...details,
        timestamp: new Date().toISOString()
    })
}

/**
 * Log configuration changes
 * @param {string} setting - Setting name
 * @param {*} oldValue - Old value
 * @param {*} newValue - New value
 * @param {string} userId - User ID who made the change
 */
const logConfigChange = (setting, oldValue, newValue, userId) => {
    winstonLogger.logConfigurationChange(setting, oldValue, newValue, userId, {
        timestamp: new Date().toISOString()
    })
}

/**
 * Log security events
 * @param {string} event - Security event name
 * @param {Object} details - Event details
 */
const logSecurityEvent = (event, details = {}) => {
    winstonLogger.logSecurity(event, {
        ...details,
        timestamp: new Date().toISOString()
    })
}

/**
 * Log performance events
 * @param {string} operation - Operation name
 * @param {number} duration - Operation duration in ms
 * @param {Object} details - Additional details
 */
const logPerformanceEvent = (operation, duration, details = {}) => {
    winstonLogger.logPerformance(operation, duration, {
        ...details,
        timestamp: new Date().toISOString()
    })
}

module.exports = {
    logSensitiveRequests,
    logDataAccess,
    logDataModification,
    logAuthentication,
    logAuthorization,
    logSystemEvent,
    logConfigChange,
    logSecurityEvent,
    logPerformanceEvent,
    // Constants
    SENSITIVE_OPERATIONS,
    SENSITIVE_ENDPOINTS
}
