const express = require('express')
const router = express.Router()
const userController = require('../controllers/user/user.controller')
const {
    validateUpdateProfile,
    validateChangePassword,
    validateCreateElectionOfficer,
    validateUpdateElectionOfficer,
    validateElectionOfficerId,
    validateGetElectionOfficers
} = require('../validators/userValidators')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/permissionMiddleware')

// All routes require authentication
router.use(authMiddleware)

// User profile management routes
// GET /api/users/me
router.get('/me', userController.getMyProfile)

// PUT /api/users/me
router.put('/me', validateUpdateProfile, userController.updateMyProfile)

// PUT /api/users/me/password
router.put('/me/password', validateChangePassword, userController.changePassword)

// GET /api/users/me/notification-preferences
router.get('/me/notification-preferences', userController.getNotificationPreferences)

// PUT /api/users/me/notification-preferences
router.put('/me/notification-preferences', userController.updateNotificationPreferences)

// Election officer management routes
// POST /api/users/election-officers
router.post('/election-officers', validateCreateElectionOfficer, userController.createElectionOfficer)

// GET /api/users/election-officers
router.get('/election-officers', validateGetElectionOfficers, userController.getMyElectionOfficers)

// GET /api/users/election-officers/:id
router.get('/election-officers/:id', validateElectionOfficerId, userController.getElectionOfficer)

// PUT /api/users/election-officers/:id
router.put('/election-officers/:id', validateElectionOfficerId, validateUpdateElectionOfficer, userController.updateElectionOfficer)

// Admin-only routes
// GET /api/users
router.get('/', requireRole(['SUPER_ADMIN', 'ADMIN']), userController.getAllUsers)

// GET /api/users/:id
router.get('/:id', requireRole(['SUPER_ADMIN', 'ADMIN']), userController.getUserById)

// POST /api/users
router.post('/', requireRole(['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']), userController.createUser)

// PUT /api/users/:id
router.put('/:id', requireRole(['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']), userController.updateUser)

// PUT /api/users/:id/role
router.put('/:id/role', requireRole(['SUPER_ADMIN', 'ADMIN']), userController.updateUserRole)

// GET /api/users/:id/activity
router.get('/:id/activity', requireRole(['SUPER_ADMIN', 'ADMIN']), userController.getUserActivity)

module.exports = router

