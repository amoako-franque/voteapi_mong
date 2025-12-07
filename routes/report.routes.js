const express = require('express')
const router = express.Router()
const reportController = require('../controllers/report/report.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireAdmin } = require('../middleware/permissionMiddleware')

// All routes require authentication and admin access
router.use(authMiddleware)
router.use(requireAdmin)

// GET /api/reports/election/:id
router.get('/election/:id', reportController.getElectionReport)

// GET /api/reports/voters
router.get('/voters', reportController.getVoterReport)

// GET /api/reports/candidates
router.get('/candidates', reportController.getCandidateReport)

// GET /api/reports/statistics
router.get('/statistics', reportController.getStatisticsReport)

// GET /api/reports/turnout
router.get('/turnout', reportController.getTurnoutAnalysis)

module.exports = router

