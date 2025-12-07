const express = require('express')
const adminController = require('../controllers/admin/admin.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validatePagination, validateObjectIdQuery, validateObjectId, validate } = require('../validators/commonValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Admin dashboard
// GET /api/admin/dashboard
router.get('/dashboard', adminController.getDashboard)

// System statistics
// GET /api/admin/statistics
router.get('/statistics', adminController.getStatistics)

// Get all elections (admin view)
// GET /api/admin/elections
router.get('/elections', validatePagination, validate, adminController.getAdminElections)

// Activity log
// GET /api/admin/activity
router.get('/activity', validatePagination, validate, adminController.getActivity)

// View all entities (Admin/Super Admin only)
// GET /api/admin/schools
router.get('/schools', validatePagination, validate, adminController.getAllSchools)

// GET /api/admin/associations
router.get('/associations', validatePagination, validate, adminController.getAllAssociations)

// GET /api/admin/candidates
router.get('/candidates', validatePagination, validate, adminController.getAllCandidates)

// GET /api/admin/voters
router.get('/voters', validatePagination, validate, adminController.getAllVoters)

// GET /api/admin/users
router.get('/users', validatePagination, validate, adminController.getAllUsers)

// Verification/Approval routes (Admin/Super Admin only)
// POST /api/admin/schools/:id/verify
router.post('/schools/:id/verify', validateObjectId('id'), validate, adminController.verifySchool)

// POST /api/admin/associations/:id/verify
router.post('/associations/:id/verify', validateObjectId('id'), validate, adminController.verifyAssociation)

// POST /api/admin/elections/:id/approve
router.post('/elections/:id/approve', validateObjectId('id'), validate, adminController.approveElection)

// User management routes (Admin/Super Admin only)
// POST /api/admin/users/:id/suspend
router.post('/users/:id/suspend', validateObjectId('id'), validate, adminController.suspendUser)

// POST /api/admin/users/:id/activate
router.post('/users/:id/activate', validateObjectId('id'), validate, adminController.activateUser)

module.exports = router

