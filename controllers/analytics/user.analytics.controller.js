const analyticsService = require('../../services/analyticsService')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const Election = require('../../models/Election')
const Vote = require('../../models/Vote')
const Poll = require('../../models/Poll')
const User = require('../../models/User')

/**
 * User Analytics Controller
 * Provides role-specific analytics for non-admin users
 * Data is filtered based on user role and organization
 */

/**
 * Get user dashboard analytics
 * GET /api/analytics/user/dashboard
 */
const getDashboard = async (req, res) => {
    try {
        const userRole = req.user.role
        const userId = req.user._id

        // Get user's organization
        const user = await User.findById(userId).select('schoolId associationId role')
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Build filter based on role
        const filter = buildRoleFilter(userRole, user)

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        // Get role-specific analytics
        const analytics = await getRoleSpecificAnalytics(userRole, userId, filter, start, end)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                period: {
                    start,
                    end
                },
                role: userRole,
                ...analytics
            }, 'User analytics dashboard retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'user_analytics_dashboard_error',
            error: error.message,
            userId: req.user._id,
            role: req.user.role
        }, 'Failed to get user analytics dashboard')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve analytics dashboard', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get my elections analytics
 * GET /api/analytics/user/my-elections
 */
const getMyElectionsAnalytics = async (req, res) => {
    try {
        const userId = req.user._id
        const userRole = req.user.role

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        // Only show elections created by user (for non-admins)
        const filter = { createdBy: userId }
        
        // For school/association admins, include their organization's elections
        if (['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN'].includes(userRole)) {
            const user = await User.findById(userId).select('schoolId associationId')
            if (user.schoolId) {
                filter.$or = [
                    { createdBy: userId },
                    { schoolId: user.schoolId }
                ]
            } else if (user.associationId) {
                filter.$or = [
                    { createdBy: userId },
                    { associationId: user.associationId }
                ]
            }
        }

        const elections = await Election.find({
            ...filter,
            createdAt: { $gte: start, $lte: end }
        }).select('title status currentPhase startDateTime endDateTime statistics')

        const stats = {
            total: elections.length,
            byStatus: {
                DRAFT: elections.filter(e => e.status === 'DRAFT').length,
                SCHEDULED: elections.filter(e => e.status === 'SCHEDULED').length,
                ACTIVE: elections.filter(e => e.status === 'ACTIVE').length,
                COMPLETED: elections.filter(e => e.status === 'COMPLETED').length,
                CANCELLED: elections.filter(e => e.status === 'CANCELLED').length
            },
            totalVotes: elections.reduce((sum, e) => sum + (e.statistics?.totalVotes || 0), 0),
            elections: elections.map(e => ({
                id: e._id,
                title: e.title,
                status: e.status,
                phase: e.currentPhase,
                startDate: e.startDateTime,
                endDate: e.endDateTime,
                totalVotes: e.statistics?.totalVotes || 0
            }))
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'My elections analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'user_my_elections_analytics_error',
            error: error.message
        }, 'Failed to get my elections analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve my elections analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get my polls analytics
 * GET /api/analytics/user/my-polls
 */
const getMyPollsAnalytics = async (req, res) => {
    try {
        const userId = req.user._id

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        const polls = await Poll.find({
            createdBy: userId,
            createdAt: { $gte: start, $lte: end }
        }).select('title pollType category status statistics startDate endDate')

        const stats = {
            total: polls.length,
            byType: {
                RATING: polls.filter(p => p.pollType === 'RATING').length,
                COMPARISON: polls.filter(p => p.pollType === 'COMPARISON').length
            },
            byStatus: {
                DRAFT: polls.filter(p => p.status === 'DRAFT').length,
                ACTIVE: polls.filter(p => p.status === 'ACTIVE').length,
                ENDED: polls.filter(p => p.status === 'ENDED').length
            },
            totalVotes: polls.reduce((sum, p) => sum + (p.statistics?.totalVotes || 0), 0),
            polls: polls.map(p => ({
                id: p._id,
                title: p.title,
                pollType: p.pollType,
                category: p.category,
                status: p.status,
                totalVotes: p.statistics?.totalVotes || 0,
                startDate: p.startDate,
                endDate: p.endDate
            }))
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'My polls analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'user_my_polls_analytics_error',
            error: error.message
        }, 'Failed to get my polls analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve my polls analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get my voting activity
 * GET /api/analytics/user/my-votes
 */
const getMyVotesAnalytics = async (req, res) => {
    try {
        const userId = req.user._id

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        const votes = await Vote.find({
            voterId: userId,
            createdAt: { $gte: start, $lte: end }
        })
            .populate('electionId', 'title')
            .populate('positionId', 'title')
            .select('electionId positionId candidateId status createdAt')

        const stats = {
            total: votes.length,
            byStatus: {
                CAST: votes.filter(v => v.status === 'CAST').length,
                VERIFIED: votes.filter(v => v.status === 'VERIFIED').length,
                COUNTED: votes.filter(v => v.status === 'COUNTED').length
            },
            votes: votes.map(v => ({
                id: v._id,
                election: v.electionId?.title,
                position: v.positionId?.title,
                status: v.status,
                createdAt: v.createdAt
            }))
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(stats, 'My votes analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'user_my_votes_analytics_error',
            error: error.message
        }, 'Failed to get my votes analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve my votes analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get organization analytics (for school/association admins)
 * GET /api/analytics/user/organization
 */
const getOrganizationAnalytics = async (req, res) => {
    try {
        const userRole = req.user.role
        const userId = req.user._id

        // Only for organization admins
        if (!['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN'].includes(userRole)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Organization admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const user = await User.findById(userId).select('schoolId associationId')
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const filter = buildRoleFilter(userRole, user)

        const { startDate, endDate } = req.query
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const end = endDate ? new Date(endDate) : new Date()

        const [elections, votes, voters] = await Promise.all([
            Election.find({
                ...filter,
                createdAt: { $gte: start, $lte: end }
            }).countDocuments(),
            Vote.find({
                ...filter,
                createdAt: { $gte: start, $lte: end }
            }).countDocuments(),
            require('../../models/VoterRegistry').countDocuments({
                ...filter,
                createdAt: { $gte: start, $lte: end }
            })
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                period: { start, end },
                elections: {
                    total: elections
                },
                votes: {
                    total: votes
                },
                voters: {
                    total: voters
                }
            }, 'Organization analytics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'user_organization_analytics_error',
            error: error.message
        }, 'Failed to get organization analytics')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve organization analytics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Build role-based filter
 */
function buildRoleFilter(role, user) {
    const filter = {}

    switch (role) {
        case 'SCHOOL_ADMIN':
            if (user.schoolId) {
                filter.schoolId = user.schoolId
            }
            break
        case 'ASSOCIATION_ADMIN':
        case 'PROFESSIONAL_ASSOCIATION_ADMIN':
            if (user.associationId) {
                filter.associationId = user.associationId
            }
            break
        case 'ELECTION_OFFICER':
            // Election officers can only see elections they manage
            filter.createdBy = user._id
            break
        default:
            // Regular users can only see their own data
            filter.createdBy = user._id
    }

    return filter
}

/**
 * Get role-specific analytics
 */
async function getRoleSpecificAnalytics(role, userId, filter, start, end) {
    const analytics = {}

    switch (role) {
        case 'SCHOOL_ADMIN':
        case 'ASSOCIATION_ADMIN':
        case 'PROFESSIONAL_ASSOCIATION_ADMIN':
            // Organization admins see organization-wide stats
            const [orgElections, orgVotes] = await Promise.all([
                Election.find({ ...filter, createdAt: { $gte: start, $lte: end } }).countDocuments(),
                Vote.find({ ...filter, createdAt: { $gte: start, $lte: end } }).countDocuments()
            ])
            analytics.organization = {
                elections: orgElections,
                votes: orgVotes
            }
            break

        case 'ELECTION_OFFICER':
            // Election officers see their managed elections
            const myElections = await Election.find({
                createdBy: userId,
                createdAt: { $gte: start, $lte: end }
            }).countDocuments()
            analytics.myElections = myElections
            break

        default:
            // Regular users see their own activity
            const [myVotes, myPolls] = await Promise.all([
                Vote.find({ voterId: userId, createdAt: { $gte: start, $lte: end } }).countDocuments(),
                Poll.find({ createdBy: userId, createdAt: { $gte: start, $lte: end } }).countDocuments()
            ])
            analytics.myActivity = {
                votes: myVotes,
                polls: myPolls
            }
    }

    return analytics
}

module.exports = {
    getDashboard,
    getMyElectionsAnalytics,
    getMyPollsAnalytics,
    getMyVotesAnalytics,
    getOrganizationAnalytics
}

