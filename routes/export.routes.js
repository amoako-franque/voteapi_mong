const express = require('express')
const router = express.Router()
const exportController = require('../controllers/export/export.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/permissionMiddleware')

// All routes require authentication
router.use(authMiddleware)

// Export routes
router.get('/elections', exportController.exportElections)
router.get('/voters', exportController.exportVoters)
router.get('/candidates', exportController.exportCandidates)
router.get('/polls', exportController.exportPolls)
router.get('/users', requireRole(['SUPER_ADMIN', 'ADMIN']), exportController.exportUsers)

module.exports = router

