const express = require('express')
const router = express.Router()
const bulkController = require('../controllers/bulk/bulk.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/permissionMiddleware')

// All routes require authentication
router.use(authMiddleware)

// Bulk voter operations (Admin only)
router.post('/voters', requireRole(['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'ASSOCIATION_ADMIN']), bulkController.bulkRegisterVoters)
router.post('/voters/import', requireRole(['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'ASSOCIATION_ADMIN']), bulkController.importVotersFromCSV)

// Bulk candidate operations (Election Officer and above)
router.post('/candidates', requireRole(['SUPER_ADMIN', 'ADMIN', 'ELECTION_OFFICER']), bulkController.bulkUpdateCandidates)

// Bulk user operations (Admin only)
router.post('/users/status', requireRole(['SUPER_ADMIN', 'ADMIN']), bulkController.bulkUpdateUserStatus)

module.exports = router

