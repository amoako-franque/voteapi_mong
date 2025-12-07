const analyticsService = require('../../services/analyticsService')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const Election = require('../../models/Election')
const Vote = require('../../models/Vote')
const User = require('../../models/User')
const Poll = require('../../models/Poll')

/**
 * Admin Analytics Controller
 * Provides comprehensive analytics for SUPER_ADMIN and ADMIN roles
 * Data visibility depends on role:
 * - SUPER_ADMIN: All data across all organizations
 * - ADMIN: Data for their organization only
 */

/**
 * Get comprehensive analytics dashboard
 * GET /api/analytics/admin/dashboard
 */
const getDashboard = async (req, res) => {
    try {
        const userRole = req.user.role
        const userId = req.user._id

        // Only admins can access
        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Default: last 30 days
        const end = endDate ? new Date(endDate) : new Date()

        // Build filter based on role
        const filter = {}
        if (userRole === 'ADMIN') {
            // Admin can only see data for their organization
            const user = await User.findById(userId).select('schoolId associationId')
            if (user.schoolId) {
                filter.schoolId = user.schoolId
            } else if (user.associationId) {
                filter.associationId = user.associationId
            }
        }
        // SUPER_ADMIN sees all data (no filter)

        // Get all analytics
        const [
            apiUsageStats,
            loginStats,
            voteAnalytics,
            userBehaviorStats,
            overallStats
        ] = await Promise.all([
            analyticsService.getApiUsageStats(start, end),
            analyticsService.getLoginStats({ createdAt: { $gte: start, $lte: end } }),
            analyticsService.getVoteAnalytics(start, end, filter),
            analyticsService.getUserBehaviorStats(start, end, filter),
            getOverallStatistics(filter)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                period: {
                    start,
                    end
                },
                role: userRole,
                apiUsage: apiUsageStats,
                login: loginStats,
                votes: voteAnalytics,
                userBehavior: userBehaviorStats,
                overall: overallStats
            }, 'Analytics dashboard retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_analytics_dashboard_error',
            error: error.message,
            userId: req.user._id,
            role: req.user.role
        }, 'Failed to get admin analytics dashboard')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve analytics dashboard', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get API usage analytics
 * GET /api/analytics/admin/api-usage
 */
const getApiUsage = async (req, res) => {
    try {
        const userRole = req.user.role

        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        const stats = await analyticsService.getApiUsageStats(start, end)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'API usage statistics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_api_usage_error',
            error: error.message
        }, 'Failed to get API usage statistics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve API usage statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get login analytics
 * GET /api/analytics/admin/login-stats
 */
const getLoginStats = async (req, res) => {
    try {
        const userRole = req.user.role

        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const dateFilter = {}
        if (startDate || endDate) {
            dateFilter.createdAt = {}
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate)
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate)
        }

        const stats = await analyticsService.getLoginStats(dateFilter)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'Login statistics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_login_stats_error',
            error: error.message
        }, 'Failed to get login statistics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve login statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get vote analytics
 * GET /api/analytics/admin/vote-analytics
 */
const getVoteAnalytics = async (req, res) => {
    try {
        const userRole = req.user.role
        const userId = req.user._id

        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        // Build filter based on role
        const filter = {}
        if (userRole === 'ADMIN') {
            const user = await User.findById(userId).select('schoolId associationId')
            if (user.schoolId) {
                filter.schoolId = user.schoolId
            } else if (user.associationId) {
                filter.associationId = user.associationId
            }
        }

        // Get vote analytics - filter by elections if needed
        let stats
        if (Object.keys(filter).length > 0) {
            // If filter exists, get elections first, then get analytics for those elections
            const elections = await Election.find(filter).select('_id')
            const electionIds = elections.map(e => e._id)

            // Get votes for filtered elections
            const Vote = require('../../models/Vote')
            const totalVotes = await Vote.countDocuments({
                electionId: { $in: electionIds },
                createdAt: { $gte: start, $lte: end }
            })

            stats = {
                totalVotes,
                votesByDate: await analyticsService.getVotesByDate({
                    electionId: { $in: electionIds },
                    createdAt: { $gte: start, $lte: end }
                }),
                votesByPosition: await analyticsService.getVotesByPosition({
                    electionId: { $in: electionIds }
                }),
                averageVotesPerHour: await analyticsService.getAverageVotesPerHour({
                    electionId: { $in: electionIds },
                    createdAt: { $gte: start, $lte: end }
                })
            }
        } else {
            // No filter - get all vote analytics
            stats = await analyticsService.getVoteAnalytics(null)
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'Vote analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_vote_analytics_error',
            error: error.message
        }, 'Failed to get vote analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve vote analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get user behavior analytics
 * GET /api/analytics/admin/user-behavior
 */
const getUserBehavior = async (req, res) => {
    try {
        const userRole = req.user.role
        const userId = req.user._id

        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        // Build filter based on role
        const filter = {}
        if (userRole === 'ADMIN') {
            const user = await User.findById(userId).select('schoolId associationId')
            if (user.schoolId) {
                filter.schoolId = user.schoolId
            } else if (user.associationId) {
                filter.associationId = user.associationId
            }
        }

        const stats = await analyticsService.getUserBehaviorAnalytics(start, end)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'User behavior statistics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_user_behavior_error',
            error: error.message
        }, 'Failed to get user behavior statistics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve user behavior statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get poll analytics
 * GET /api/analytics/admin/poll-analytics
 */
const getPollAnalytics = async (req, res) => {
    try {
        const userRole = req.user.role

        if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        const stats = await analyticsService.getPollAnalytics(start, end)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'Poll analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'admin_poll_analytics_error',
            error: error.message
        }, 'Failed to get poll analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve poll analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get overall statistics
 */
async function getOverallStatistics(filter = {}) {
    const [
        totalElections,
        activeElections,
        totalVotes,
        totalUsers,
        totalPolls
    ] = await Promise.all([
        Election.countDocuments(filter),
        Election.countDocuments({ ...filter, status: 'ACTIVE' }),
        Vote.countDocuments({ ...filter, status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] } }),
        User.countDocuments(filter),
        Poll.countDocuments(filter)
    ])

    return {
        elections: {
            total: totalElections,
            active: activeElections
        },
        votes: {
            total: totalVotes
        },
        users: {
            total: totalUsers
        },
        polls: {
            total: totalPolls
        }
    }
}

module.exports = {
    getDashboard,
    getApiUsage,
    getLoginStats,
    getVoteAnalytics,
    getUserBehavior,
    getPollAnalytics
}

