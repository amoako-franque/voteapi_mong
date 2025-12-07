const mongoose = require('mongoose')
const Election = require('../../models/Election')
const Vote = require('../../models/Vote')
const VoterRegistry = require('../../models/VoterRegistry')
const Candidate = require('../../models/Candidate')
const User = require('../../models/User')
const School = require('../../models/School')
const Association = require('../../models/Association')
const Position = require('../../models/Position')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Get admin dashboard data
 * GET /api/admin/dashboard
 */
const getDashboard = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can access dashboard
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Get overall statistics
        const [
            totalElections,
            activeElections,
            completedElections,
            totalVotes,
            totalVoters,
            totalCandidates,
            totalUsers,
            totalSchools,
            totalAssociations
        ] = await Promise.all([
            Election.countDocuments(),
            Election.countDocuments({ status: 'ACTIVE' }),
            Election.countDocuments({ status: 'COMPLETED' }),
            Vote.countDocuments({ status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] } }),
            VoterRegistry.countDocuments({ isActive: true }),
            Candidate.countDocuments({ status: 'APPROVED' }),
            User.countDocuments(),
            School.countDocuments({ isActive: true }),
            Association.countDocuments({ isActive: true })
        ])

        // Get recent elections
        const recentElections = await Election.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('schoolId', 'name code')
            .populate('associationId', 'name code')
            .select('title scope status currentPhase startDateTime endDateTime createdAt')

        // Get recent votes
        const recentVotes = await Vote.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('electionId', 'title')
            .populate('positionId', 'title')
            .select('electionId positionId candidateId timestamp status')

        // Get upcoming elections
        const now = new Date()
        const upcomingElections = await Election.find({
            startDateTime: { $gt: now },
            status: { $in: ['DRAFT', 'SCHEDULED'] }
        })
            .sort({ startDateTime: 1 })
            .limit(5)
            .select('title scope startDateTime endDateTime status')

        logger.info({
            type: 'admin_dashboard_accessed',
            userId,
            userRole
        }, 'Admin dashboard accessed')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                statistics: {
                    elections: {
                        total: totalElections,
                        active: activeElections,
                        completed: completedElections,
                        upcoming: upcomingElections.length
                    },
                    votes: {
                        total: totalVotes
                    },
                    users: {
                        total: totalUsers,
                        voters: totalVoters,
                        candidates: totalCandidates
                    },
                    organizations: {
                        schools: totalSchools,
                        associations: totalAssociations
                    }
                },
                recentElections,
                recentVotes,
                upcomingElections,
                generatedAt: new Date()
            }, 'Dashboard data retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_dashboard_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get dashboard data')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get dashboard data', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get system statistics
 * GET /api/admin/statistics
 */
const getStatistics = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can access statistics
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
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

        // Election statistics
        const electionStats = await Election.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ])

        // Vote statistics
        const voteStats = await Vote.aggregate([
            { $match: { ...dateFilter, status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ])

        // User statistics by role
        const userStats = await User.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            }
        ])

        // Voter statistics
        const voterStats = await VoterRegistry.aggregate([
            { $match: { ...dateFilter, isActive: true } },
            {
                $group: {
                    _id: '$eligibilityStatus',
                    count: { $sum: 1 }
                }
            }
        ])

        // Candidate statistics
        const candidateStats = await Candidate.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ])

        // Calculate turnout rates
        const electionsWithVotes = await Election.aggregate([
            {
                $lookup: {
                    from: 'votes',
                    localField: '_id',
                    foreignField: 'electionId',
                    as: 'votes'
                }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    totalEligibleVoters: { $ifNull: ['$statistics.totalEligibleVoters', 0] },
                    totalVotes: { $size: '$votes' },
                    status: 1
                }
            },
            {
                $match: {
                    totalEligibleVoters: { $gt: 0 }
                }
            }
        ])

        const turnoutStats = electionsWithVotes.map(election => ({
            electionId: election._id,
            title: election.title,
            totalEligibleVoters: election.totalEligibleVoters,
            totalVotes: election.totalVotes,
            turnoutPercentage: ((election.totalVotes / election.totalEligibleVoters) * 100).toFixed(2)
        }))

        logger.info({
            type: 'admin_statistics_accessed',
            userId,
            userRole,
            dateRange: { startDate, endDate }
        }, 'Admin statistics accessed')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                elections: electionStats,
                votes: voteStats,
                users: userStats,
                voters: voterStats,
                candidates: candidateStats,
                turnout: turnoutStats,
                dateRange: {
                    startDate: startDate || null,
                    endDate: endDate || null
                },
                generatedAt: new Date()
            }, 'Statistics retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_statistics_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get statistics')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get statistics', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all elections with statistics
 * GET /api/admin/elections
 */
const getAdminElections = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can access
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { status, scope, page = 1, limit = 50 } = req.query
        const query = {}

        if (status) query.status = status
        if (scope) query.scope = scope

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [elections, total] = await Promise.all([
            Election.find(query)
                .populate('schoolId', 'name code')
                .populate('associationId', 'name code')
                .populate('createdBy', 'firstname lastname email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Election.countDocuments(query)
        ])

        // Get statistics for each election
        const electionsWithStats = await Promise.all(
            elections.map(async (election) => {
                const voteCount = await Vote.countDocuments({
                    electionId: election._id,
                    status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
                })

                const candidateCount = await Candidate.countDocuments({
                    electionId: election._id,
                    status: 'APPROVED'
                })

                const positionCount = await Position.countDocuments({
                    electionId: election._id
                })

                return {
                    ...election.toObject(),
                    statistics: {
                        ...election.statistics,
                        totalVotes: voteCount,
                        totalCandidates: candidateCount,
                        totalPositions: positionCount
                    }
                }
            })
        )

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                elections: electionsWithStats,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Elections retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_admin_elections_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get admin elections')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get elections', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get system activity log
 * GET /api/admin/activity
 */
const getActivity = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        // Only admins can access
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, type } = req.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        // Get recent elections, votes, and candidates
        const [recentElections, recentVotes, recentCandidates] = await Promise.all([
            Election.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .select('title scope status createdAt createdBy')
                .populate('createdBy', 'firstname lastname email'),
            Vote.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .select('electionId positionId candidateId timestamp')
                .populate('electionId', 'title'),
            Candidate.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .select('fullName positionId electionId status createdAt')
                .populate('positionId', 'title')
                .populate('electionId', 'title')
        ])

        const activity = [
            ...recentElections.map(e => ({
                type: 'ELECTION_CREATED',
                description: `Election "${ e.title }" created`,
                timestamp: e.createdAt,
                user: e.createdBy,
                data: { electionId: e._id, scope: e.scope, status: e.status }
            })),
            ...recentVotes.map(v => ({
                type: 'VOTE_CAST',
                description: `Vote cast in "${ v.electionId?.title || 'Election' }"`,
                timestamp: v.timestamp,
                data: { voteId: v._id, electionId: v.electionId?._id, positionId: v.positionId }
            })),
            ...recentCandidates.map(c => ({
                type: 'CANDIDATE_ADDED',
                description: `Candidate "${ c.fullName }" added`,
                timestamp: c.createdAt,
                data: { candidateId: c._id, positionId: c.positionId?._id, status: c.status }
            }))
        ].sort((a, b) => b.timestamp - a.timestamp).slice(0, parseInt(limit))

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                activity,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: activity.length
                }
            }, 'Activity log retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_activity_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get activity log')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get activity log', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all schools (Admin/Super Admin only)
 * GET /api/admin/schools
 */
const getAllSchools = async (req, res) => {
    try {
        const userRole = req.user.role
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, isActive, isVerified } = req.query
        const query = {}
        if (isActive !== undefined) query.isActive = isActive === 'true'
        if (isVerified !== undefined) query.isVerified = isVerified === 'true'

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const [schools, total] = await Promise.all([
            School.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            School.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                schools,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Schools retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_schools_error',
            error: error.message
        }, 'Failed to get all schools')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get schools', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all associations (Admin/Super Admin only)
 * GET /api/admin/associations
 */
const getAllAssociations = async (req, res) => {
    try {
        const userRole = req.user.role
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, isActive, isVerified } = req.query
        const query = {}
        if (isActive !== undefined) query.isActive = isActive === 'true'
        if (isVerified !== undefined) query.isVerified = isVerified === 'true'

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const [associations, total] = await Promise.all([
            Association.find(query).populate('schoolId', 'name code').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Association.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                associations,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Associations retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_associations_error',
            error: error.message
        }, 'Failed to get all associations')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get associations', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all candidates (Admin/Super Admin only)
 * GET /api/admin/candidates
 */
const getAllCandidates = async (req, res) => {
    try {
        const userRole = req.user.role
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, status, electionId } = req.query
        const query = {}
        if (status) query.status = status
        if (electionId) query.electionId = electionId

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const [candidates, total] = await Promise.all([
            Candidate.find(query)
                .populate('electionId', 'title')
                .populate('positionId', 'title')
                .populate('voterId', 'fullName email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Candidate.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                candidates,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Candidates retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_candidates_error',
            error: error.message
        }, 'Failed to get all candidates')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all voters (Admin/Super Admin only)
 * GET /api/admin/voters
 */
const getAllVoters = async (req, res) => {
    try {
        const userRole = req.user.role
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, schoolId, associationId, eligibilityStatus } = req.query
        const query = {}
        if (schoolId) query.schoolId = schoolId
        if (associationId) query.associationId = associationId
        if (eligibilityStatus) query.eligibilityStatus = eligibilityStatus

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const [voters, total] = await Promise.all([
            VoterRegistry.find(query)
                .populate('schoolId', 'name code')
                .populate('associationId', 'name code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            VoterRegistry.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                voters,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Voters retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_voters_error',
            error: error.message
        }, 'Failed to get all voters')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all users (Admin/Super Admin only)
 * GET /api/admin/users
 */
const getAllUsers = async (req, res) => {
    try {
        const userRole = req.user.role
        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50, role, isActive } = req.query
        const query = {}
        if (role) query.role = role
        if (isActive !== undefined) query.isActive = isActive === 'true'

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Users retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_users_error',
            error: error.message
        }, 'Failed to get all users')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get users', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Suspend a user (Admin/Super Admin only)
 * POST /api/admin/users/:id/suspend
 */
const suspendUser = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role
        const { id } = req.params
        const { reason } = req.body

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Prevent suspending yourself
        if (id === userId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('You cannot suspend your own account', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const user = await User.findById(id)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Prevent suspending SUPER_ADMIN
        if (user.role === 'SUPER_ADMIN' && userRole !== 'SUPER_ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only SUPER_ADMIN can suspend another SUPER_ADMIN', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!user.isActive) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('User is already deactivated', HTTP_STATUS.BAD_REQUEST)
            )
        }

        user.isActive = false
        user.suspendedBy = userId
        user.suspendedAt = new Date()
        if (reason) {
            user.suspensionReason = reason
        }
        await user.save()

        logger.info({
            type: 'user_suspended_by_admin',
            userId: user._id,
            suspendedBy: userId,
            userRole,
            reason
        }, 'User suspended by admin')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(user, 'User suspended successfully')
        )
    } catch (error) {
        logger.error({
            type: 'suspend_user_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to suspend user')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to suspend user', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Activate/Reactivate a user (Admin/Super Admin only)
 * POST /api/admin/users/:id/activate
 */
const activateUser = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role
        const { id } = req.params

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const user = await User.findById(id)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (user.isActive) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('User is already active', HTTP_STATUS.BAD_REQUEST)
            )
        }

        user.isActive = true
        user.activatedBy = userId
        user.activatedAt = new Date()
        user.suspensionReason = undefined
        await user.save()

        logger.info({
            type: 'user_activated_by_admin',
            userId: user._id,
            activatedBy: userId,
            userRole
        }, 'User activated by admin')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(user, 'User activated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'activate_user_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to activate user')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to activate user', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify/Approve a school (Admin/Super Admin only)
 * POST /api/admin/schools/:id/verify
 */
const verifySchool = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role
        const { id } = req.params

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid school ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const school = await School.findById(id)
        if (!school) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (school.isVerified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('School is already verified', HTTP_STATUS.BAD_REQUEST)
            )
        }

        school.isVerified = true
        school.verifiedBy = userId
        school.verifiedAt = new Date()
        school.isActive = true
        await school.save()

        logger.info({
            type: 'school_verified_by_admin',
            schoolId: school._id,
            userId,
            userRole
        }, 'School verified by admin')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(school, 'School verified successfully')
        )
    } catch (error) {
        logger.error({
            type: 'verify_school_error',
            error: error.message,
            schoolId: req.params.id
        }, 'Failed to verify school')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify/Approve an association (Admin/Super Admin only)
 * POST /api/admin/associations/:id/verify
 */
const verifyAssociation = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role
        const { id } = req.params

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid association ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const association = await Association.findById(id)
        if (!association) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (association.isVerified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Association is already verified', HTTP_STATUS.BAD_REQUEST)
            )
        }

        association.isVerified = true
        association.verifiedBy = userId
        association.verifiedAt = new Date()
        association.isActive = true
        await association.save()

        logger.info({
            type: 'association_verified_by_admin',
            associationId: association._id,
            userId,
            userRole
        }, 'Association verified by admin')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(association, 'Association verified successfully')
        )
    } catch (error) {
        logger.error({
            type: 'verify_association_error',
            error: error.message,
            associationId: req.params.id
        }, 'Failed to verify association')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Approve/Confirm an election (Admin/Super Admin only)
 * POST /api/admin/elections/:id/approve
 */
const approveElection = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role
        const { id } = req.params

        if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Admin access required', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const election = await Election.findById(id)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (election.confirmedBy) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election is already approved', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify that the linked school or association is verified
        if (election.scope === 'SCHOOL' && election.schoolId) {
            const school = await School.findById(election.schoolId)
            if (!school || !school.isVerified || !school.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Linked school must be verified and active before approving election', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        if (election.scope === 'ASSOCIATION' && election.associationId) {
            const association = await Association.findById(election.associationId)
            if (!association || !association.isVerified || !association.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Linked association must be verified and active before approving election', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        election.confirmedBy = userId
        election.confirmedAt = new Date()

        // If election is in DRAFT status, change to SCHEDULED
        const { ELECTION_STATUS } = require('../../utils/constants')
        if (election.status === ELECTION_STATUS.DRAFT) {
            election.status = ELECTION_STATUS.SCHEDULED
        }

        await election.save()

        logger.info({
            type: 'election_approved_by_admin',
            electionId: election._id,
            userId,
            userRole,
            electionTitle: election.title
        }, 'Election approved by admin')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Election approved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'approve_election_error',
            error: error.message,
            electionId: req.params.id
        }, 'Failed to approve election')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to approve election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getDashboard,
    getStatistics,
    getAdminElections,
    getActivity,
    getAllSchools,
    getAllAssociations,
    getAllCandidates,
    getAllVoters,
    getAllUsers,
    verifySchool,
    verifyAssociation,
    approveElection,
    suspendUser,
    activateUser
}

