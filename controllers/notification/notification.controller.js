const mongoose = require('mongoose')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const Notification = require('../../models/Notification')
const notificationService = require('../../services/notificationService')

/**
 * Get user's notifications
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id
        const { page = 1, limit = 50, status, type, unreadOnly } = req.query

        const query = { recipientId: userId }

        if (status) {
            query.status = status
        }

        if (type) {
            query.type = type
        }

        if (unreadOnly === 'true') {
            query.readAt = { $exists: false }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('electionId', 'title')
                .populate('schoolId', 'name'),
            Notification.countDocuments(query),
            Notification.countDocuments({ recipientId: userId, readAt: { $exists: false } })
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                notifications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                },
                unreadCount
            }, 'Notifications retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_notifications_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get notifications')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve notifications', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.id

        const unreadCount = await Notification.countDocuments({
            recipientId: userId,
            readAt: { $exists: false }
        })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({ unreadCount }, 'Unread count retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_unread_count_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get unread count')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve unread count', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a specific notification
 * GET /api/notifications/:id
 */
const getNotification = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid notification ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const notification = await Notification.findOne({
            _id: id,
            recipientId: userId
        })
            .populate('electionId', 'title')
            .populate('schoolId', 'name')

        if (!notification) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Notification not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(notification, 'Notification retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_notification_error',
            error: error.message,
            userId: req.user.id,
            notificationId: req.params.id
        }, 'Failed to get notification')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve notification', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid notification ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const notification = await Notification.findOne({
            _id: id,
            recipientId: userId
        })

        if (!notification) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Notification not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (!notification.readAt) {
            notification.readAt = new Date()
            await notification.save()
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(notification, 'Notification marked as read')
        )
    } catch (error) {
        logger.error({
            type: 'mark_notification_read_error',
            error: error.message,
            userId: req.user.id,
            notificationId: req.params.id
        }, 'Failed to mark notification as read')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to mark notification as read', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id

        const result = await Notification.updateMany(
            {
                recipientId: userId,
                readAt: { $exists: false }
            },
            {
                $set: { readAt: new Date() }
            }
        )

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({ updatedCount: result.modifiedCount }, 'All notifications marked as read')
        )
    } catch (error) {
        logger.error({
            type: 'mark_all_notifications_read_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to mark all notifications as read')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to mark all notifications as read', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete a notification
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid notification ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const notification = await Notification.findOneAndDelete({
            _id: id,
            recipientId: userId
        })

        if (!notification) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Notification not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Notification deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'delete_notification_error',
            error: error.message,
            userId: req.user.id,
            notificationId: req.params.id
        }, 'Failed to delete notification')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete notification', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Create a notification (Admin/Super Admin only)
 * POST /api/notifications
 */
const createNotification = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can create notifications
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            recipientId,
            type,
            title,
            message,
            electionId,
            schoolId,
            channel = 'IN_APP'
        } = req.body

        if (!recipientId || !type || !title || !message) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('recipientId, type, title, and message are required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const notification = await notificationService.sendNotification({
            recipientId,
            type,
            title,
            message,
            electionId,
            schoolId,
            channel
        })

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created(notification, 'Notification created and sent successfully')
        )
    } catch (error) {
        logger.error({
            type: 'create_notification_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to create notification')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create notification', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Send bulk notifications (Admin/Super Admin only)
 * POST /api/notifications/bulk-send
 */
const bulkSendNotifications = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can send bulk notifications
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            recipientIds,
            type,
            title,
            message,
            electionId,
            schoolId,
            channel = 'IN_APP'
        } = req.body

        if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('recipientIds must be a non-empty array', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!type || !title || !message) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('type, title, and message are required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const results = await Promise.allSettled(
            recipientIds.map(recipientId =>
                notificationService.sendNotification({
                    recipientId,
                    type,
                    title,
                    message,
                    electionId,
                    schoolId,
                    channel
                })
            )
        )

        const successful = results.filter(r => r.status === 'fulfilled').length
        const failed = results.filter(r => r.status === 'rejected').length

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                total: recipientIds.length,
                successful,
                failed
            }, `Bulk notifications sent: ${ successful } successful, ${ failed } failed`)
        )
    } catch (error) {
        logger.error({
            type: 'bulk_send_notifications_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to send bulk notifications')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to send bulk notifications', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getNotifications,
    getUnreadCount,
    getNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification,
    bulkSendNotifications
}

