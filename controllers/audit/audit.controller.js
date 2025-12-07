const mongoose = require('mongoose')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const AuditLog = require('../../models/AuditLog')
const SecurityEvent = require('../../models/SecurityEvent')

/**
 * Get audit logs (Admin/Super Admin only)
 * GET /api/audit
 */
const getAuditLogs = async (req, res) => {
    try {
        const userRole = req.user.role

        // Only admins can view audit logs
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            page = 1,
            limit = 50,
            action,
            userId,
            startDate,
            endDate,
            success,
            ipAddress
        } = req.query

        const query = {}

        if (action) {
            query.action = action
        }

        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
                )
            }
            query.userId = userId
        }

        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) {
                query.timestamp.$gte = new Date(startDate)
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate)
            }
        }

        if (success !== undefined) {
            query.success = success === 'true'
        }

        if (ipAddress) {
            query['metadata.ipAddress'] = ipAddress
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [auditLogs, total] = await Promise.all([
            AuditLog.find(query)
                .populate('userId', 'email firstname lastname role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AuditLog.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                auditLogs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Audit logs retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_audit_logs_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get audit logs')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get security events (Admin/Super Admin only)
 * GET /api/audit/security
 */
const getSecurityEvents = async (req, res) => {
    try {
        const userRole = req.user.role

        // Only admins can view security events
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            page = 1,
            limit = 50,
            eventType,
            severity,
            userId,
            startDate,
            endDate,
            resolved
        } = req.query

        const query = {}

        if (eventType) {
            query.eventType = eventType
        }

        if (severity) {
            query.severity = severity
        }

        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
                )
            }
            query.userId = userId
        }

        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) {
                query.timestamp.$gte = new Date(startDate)
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate)
            }
        }

        if (resolved !== undefined) {
            query.resolved = resolved === 'true'
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [securityEvents, total] = await Promise.all([
            SecurityEvent.find(query)
                .populate('userId', 'email firstname lastname role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            SecurityEvent.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                securityEvents,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Security events retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_security_events_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get security events')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve security events', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Search audit logs (Admin/Super Admin only)
 * GET /api/audit/search
 */
const searchAuditLogs = async (req, res) => {
    try {
        const userRole = req.user.role

        // Only admins can search audit logs
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            q,
            page = 1,
            limit = 50,
            startDate,
            endDate
        } = req.query

        if (!q || q.trim().length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Search query is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const query = {
            $or: [
                { action: { $regex: q, $options: 'i' } },
                { 'metadata.description': { $regex: q, $options: 'i' } },
                { 'metadata.ipAddress': { $regex: q, $options: 'i' } },
                { 'metadata.userAgent': { $regex: q, $options: 'i' } }
            ]
        }

        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) {
                query.timestamp.$gte = new Date(startDate)
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate)
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [auditLogs, total] = await Promise.all([
            AuditLog.find(query)
                .populate('userId', 'email firstname lastname role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AuditLog.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                auditLogs,
                query: q,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Audit logs search completed')
        )
    } catch (error) {
        logger.error({
            type: 'search_audit_logs_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to search audit logs')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to search audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get user-specific audit logs (Admin/Super Admin only)
 * GET /api/audit/user/:userId
 */
const getUserAuditLogs = async (req, res) => {
    try {
        const userRole = req.user.role

        // Only admins can view user audit logs
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { userId } = req.params
        const { page = 1, limit = 50, action, startDate, endDate } = req.query

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const query = { userId }

        if (action) {
            query.action = action
        }

        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) {
                query.timestamp.$gte = new Date(startDate)
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate)
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [auditLogs, total] = await Promise.all([
            AuditLog.find(query)
                .populate('userId', 'email firstname lastname role')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AuditLog.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                auditLogs,
                userId,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'User audit logs retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_user_audit_logs_error',
            error: error.message,
            userId: req.user.id,
            targetUserId: req.params.userId
        }, 'Failed to get user audit logs')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve user audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export audit logs as CSV (Admin/Super Admin only)
 * GET /api/audit/export
 */
const exportAuditLogs = async (req, res) => {
    try {
        const userRole = req.user.role

        // Only admins can export audit logs
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            action,
            userId,
            startDate,
            endDate,
            success
        } = req.query

        const query = {}

        if (action) {
            query.action = action
        }

        if (userId) {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
                )
            }
            query.userId = userId
        }

        if (startDate || endDate) {
            query.timestamp = {}
            if (startDate) {
                query.timestamp.$gte = new Date(startDate)
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate)
            }
        }

        if (success !== undefined) {
            query.success = success === 'true'
        }

        const auditLogs = await AuditLog.find(query)
            .populate('userId', 'email firstname lastname role')
            .sort({ timestamp: -1 })
            .limit(10000) // Limit export to 10k records

        // Generate CSV
        const csvHeader = 'Timestamp,Action,User,Email,Role,Success,IP Address,User Agent,Description\n'
        const csvRows = auditLogs.map(log => {
            const user = log.userId || {}
            const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : ''
            const action = log.action || ''
            const userEmail = user.email || ''
            const userName = user.firstname && user.lastname ? `${ user.firstname } ${ user.lastname }` : ''
            const userRole = user.role || ''
            const success = log.success ? 'Yes' : 'No'
            const ipAddress = log.metadata?.ipAddress || ''
            const userAgent = (log.metadata?.userAgent || '').replace(/,/g, ';') // Replace commas in user agent
            const description = (log.metadata?.description || '').replace(/,/g, ';').replace(/\n/g, ' ') // Replace commas and newlines

            return `${ timestamp },${ action },${ userName },${ userEmail },${ userRole },${ success },${ ipAddress },${ userAgent },${ description }`
        }).join('\n')

        const csv = csvHeader + csvRows

        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${ Date.now() }.csv`)

        return res.status(HTTP_STATUS.OK).send(csv)
    } catch (error) {
        logger.error({
            type: 'export_audit_logs_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to export audit logs')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export audit logs', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getAuditLogs,
    getSecurityEvents,
    searchAuditLogs,
    getUserAuditLogs,
    exportAuditLogs
}

