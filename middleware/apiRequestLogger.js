const ApiRequestLog = require('../models/ApiRequestLog')
const logger = require('../utils/logger')

/**
 * API Request Logging Middleware
 * Logs all API requests to database for analytics
 */
const apiRequestLogger = async (req, res, next) => {
    const startTime = Date.now()
    const originalSend = res.send

    // Capture response
    res.send = function (body) {
        res.send = originalSend
        const responseTime = Date.now() - startTime

        // Log asynchronously (don't block response)
        logRequest(req, res, responseTime, body).catch(error => {
            logger.error({
                type: 'api_request_log_error',
                error: error.message
            }, 'Failed to log API request')
        })

        return originalSend.call(this, body)
    }

    next()
}

/**
 * Log API request to database
 */
async function logRequest(req, res, responseTime, responseBody) {
    try {
        // Skip logging for health checks and static files
        if (req.path === '/health' || req.path.startsWith('/static/')) {
            return
        }

        // Get user ID from request (if authenticated)
        const userId = req.user?._id || null

        // Calculate sizes
        const requestSize = req.headers['content-length']
            ? parseInt(req.headers['content-length'])
            : 0

        const responseSize = responseBody
            ? Buffer.byteLength(JSON.stringify(responseBody), 'utf8')
            : 0

        // Extract endpoint (remove query params and IDs for grouping)
        let endpoint = req.path
            .replace(/\/\d+/g, '/:id') // Replace numeric IDs
            .replace(/\/[a-f0-9]{24}/g, '/:id') // Replace MongoDB ObjectIds
            .replace(/\?.*$/, '') // Remove query params

        // Create log entry
        await ApiRequestLog.create({
            method: req.method,
            path: req.path,
            endpoint: endpoint,
            userId: userId,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            statusCode: res.statusCode,
            responseTime: responseTime,
            requestSize: requestSize,
            responseSize: responseSize,
            error: res.statusCode >= 400 ? (responseBody?.message || 'Request failed') : null,
            timestamp: new Date()
        })
    } catch (error) {
        // Don't throw - logging failures shouldn't break the app
        logger.error({
            type: 'api_request_log_error',
            error: error.message,
            path: req.path
        }, 'Failed to log API request')
    }
}

module.exports = apiRequestLogger
