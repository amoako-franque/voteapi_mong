const express = require('express')
const router = express.Router()
const emailTemplateController = require('../controllers/emailTemplate/emailTemplate.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/permissionMiddleware')

// All routes require authentication and admin role
router.use(authMiddleware)
router.use(requireRole(['SUPER_ADMIN', 'ADMIN']))

// Email template routes
router.get('/', emailTemplateController.getTemplates)
router.get('/:name', emailTemplateController.getTemplate)
router.post('/', emailTemplateController.createTemplate)
router.put('/:name', emailTemplateController.updateTemplate)
router.delete('/:name', emailTemplateController.deleteTemplate)

module.exports = router

