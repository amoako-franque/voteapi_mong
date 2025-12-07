const express = require('express')
const router = express.Router()
const notificationController = require('../controllers/notification/notification.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireAdmin } = require('../middleware/permissionMiddleware')
const { validateObjectId, validate } = require('../validators/commonValidators')

// All routes require authentication
router.use(authMiddleware)

// User notification routes
// GET /api/notifications
router.get('/', notificationController.getNotifications)

// GET /api/notifications/unread-count
router.get('/unread-count', notificationController.getUnreadCount)

// GET /api/notifications/:id
router.get('/:id', validateObjectId('id'), validate, notificationController.getNotification)

// PUT /api/notifications/:id/read
router.put('/:id/read', validateObjectId('id'), validate, notificationController.markAsRead)

// PUT /api/notifications/read-all
router.put('/read-all', notificationController.markAllAsRead)

// DELETE /api/notifications/:id
router.delete('/:id', validateObjectId('id'), validate, notificationController.deleteNotification)

// Admin routes (Admin/Super Admin only)
// POST /api/notifications
router.post('/', requireAdmin, notificationController.createNotification)

// POST /api/notifications/bulk-send
router.post('/bulk-send', requireAdmin, notificationController.bulkSendNotifications)

module.exports = router

