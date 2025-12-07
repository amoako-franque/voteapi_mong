const express = require('express')
const router = express.Router()
const adminAnalyticsController = require('../controllers/analytics/admin.analytics.controller')
const userAnalyticsController = require('../controllers/analytics/user.analytics.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { requireRole } = require('../middleware/permissionMiddleware')

// All routes require authentication
router.use(authMiddleware)

// Admin Analytics Routes (SUPER_ADMIN and ADMIN only)
router.get('/admin/dashboard', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getDashboard)
router.get('/admin/api-usage', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getApiUsage)
router.get('/admin/login-stats', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getLoginStats)
router.get('/admin/vote-analytics', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getVoteAnalytics)
router.get('/admin/user-behavior', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getUserBehavior)
router.get('/admin/poll-analytics', requireRole(['SUPER_ADMIN', 'ADMIN']), adminAnalyticsController.getPollAnalytics)

// User Analytics Routes (All authenticated users)
router.get('/user/dashboard', userAnalyticsController.getDashboard)
router.get('/user/my-elections', userAnalyticsController.getMyElectionsAnalytics)
router.get('/user/my-polls', userAnalyticsController.getMyPollsAnalytics)
router.get('/user/my-votes', userAnalyticsController.getMyVotesAnalytics)
router.get('/user/organization', requireRole(['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']), userAnalyticsController.getOrganizationAnalytics)

module.exports = router

