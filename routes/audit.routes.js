const express = require('express')
const router = express.Router()
const auditController = require('../controllers/audit/audit.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireAdmin } = require('../middleware/permissionMiddleware')
const { validateObjectId, validate } = require('../validators/commonValidators')

// All routes require authentication and admin access
router.use(authMiddleware)
router.use(requireAdmin)

// GET /api/audit
router.get('/', auditController.getAuditLogs)

// GET /api/audit/security
router.get('/security', auditController.getSecurityEvents)

// GET /api/audit/search
router.get('/search', auditController.searchAuditLogs)

// GET /api/audit/user/:userId
router.get('/user/:userId', validateObjectId('userId'), validate, auditController.getUserAuditLogs)

// GET /api/audit/export
router.get('/export', auditController.exportAuditLogs)

module.exports = router

