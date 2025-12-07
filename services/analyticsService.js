const logger = require('../utils/logger')
const Vote = require('../models/Vote')
const Election = require('../models/Election')
const User = require('../models/User')
const Poll = require('../models/Poll')
const PollVote = require('../models/PollVote')
const LoginLog = require('../models/LoginLog')
const ApiRequestLog = require('../models/ApiRequestLog')
const Position = require('../models/Position')
const VoterRegistry = require('../models/VoterRegistry')

/**
 * Analytics Service
 * Provides API usage statistics, vote analytics, and user behavior tracking
 */
class AnalyticsService {
    /**
     * Validate and sanitize date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Object} Validated date range
     */
    validateDateRange(startDate, endDate) {
        const start = startDate instanceof Date ? startDate : new Date(startDate)
        const end = endDate instanceof Date ? endDate : new Date(endDate)

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date range provided')
        }

        if (start > end) {
            throw new Error('Start date must be before end date')
        }

        return { start, end }
    }

    /**
     * Create date filter object
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Object} MongoDB date filter
     */
    createDateFilter(startDate, endDate) {
        return {
            createdAt: {
                $gte: startDate,
                $lte: endDate
            }
        }
    }

    /**
     * Calculate average per day
     * @param {number} total - Total count
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {number} Average per day
     */
    calculateAveragePerDay(total, startDate, endDate) {
        const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
        return Math.round((total / days) * 100) / 100
    }

    /**
     * Get API usage statistics
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} API usage stats
     */
    async getApiUsageStats(startDate, endDate) {
        try {
            const { start, end } = this.validateDateRange(startDate, endDate)
            const dateFilter = this.createDateFilter(start, end)

            const [totalVotes, totalElections, totalUsers, totalPolls] = await Promise.all([
                Vote.countDocuments(dateFilter),
                Election.countDocuments(dateFilter),
                User.countDocuments(dateFilter),
                Poll.countDocuments(dateFilter)
            ])

            // Get actual API request statistics
            const apiStats = await ApiRequestLog.getApiUsageStats(start, end)
            const requestsByEndpoint = await ApiRequestLog.getRequestsByEndpoint(start, end)

            return {
                period: {
                    start,
                    end
                },
                api: {
                    totalRequests: apiStats.totalRequests || 0,
                    successfulRequests: apiStats.successfulRequests || 0,
                    failedRequests: apiStats.failedRequests || 0,
                    uniqueUsers: apiStats.uniqueUsers || 0,
                    avgResponseTime: apiStats.avgResponseTime || 0,
                    averagePerDay: apiStats.averagePerDay || 0,
                    requestsByEndpoint: (requestsByEndpoint || []).map(item => ({
                        endpoint: item._id || 'unknown',
                        count: item.count || 0,
                        avgResponseTime: Math.round((item.avgResponseTime || 0) * 100) / 100,
                        errors: item.errors || 0
                    }))
                },
                votes: {
                    total: totalVotes,
                    averagePerDay: this.calculateAveragePerDay(totalVotes, start, end)
                },
                elections: {
                    total: totalElections,
                    averagePerDay: this.calculateAveragePerDay(totalElections, start, end)
                },
                users: {
                    total: totalUsers,
                    averagePerDay: this.calculateAveragePerDay(totalUsers, start, end)
                },
                polls: {
                    total: totalPolls,
                    averagePerDay: this.calculateAveragePerDay(totalPolls, start, end)
                }
            }
        } catch (error) {
            logger.error({
                type: 'analytics_api_usage_error',
                error: error.message,
                stack: error.stack
            }, 'Failed to get API usage stats')
            throw error
        }
    }

    /**
     * Get vote analytics
     * @param {string} electionId - Optional election ID
     * @returns {Promise<Object>} Vote analytics
     */
    async getVoteAnalytics(electionId = null) {
        try {
            const query = electionId ? { electionId } : {}

            const [
                totalVotes,
                votesByDate,
                votesByPosition,
                turnoutRate,
                averageVotesPerHour
            ] = await Promise.all([
                Vote.countDocuments(query),
                this.getVotesByDate(query),
                this.getVotesByPosition(query),
                this.getTurnoutRate(electionId),
                this.getAverageVotesPerHour(query)
            ])

            return {
                totalVotes,
                votesByDate,
                votesByPosition,
                turnoutRate,
                averageVotesPerHour
            }
        } catch (error) {
            logger.error({
                type: 'analytics_vote_error',
                error: error.message,
                stack: error.stack,
                electionId
            }, 'Failed to get vote analytics')
            throw error
        }
    }

    /**
     * Get votes by date
     * @param {Object} query - MongoDB query
     * @returns {Promise<Array>} Votes grouped by date
     */
    async getVotesByDate(query) {
        try {
            const votes = await Vote.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])

            return votes.map(v => ({
                date: v._id,
                count: v.count
            }))
        } catch (error) {
            logger.error({
                type: 'analytics_votes_by_date_error',
                error: error.message
            }, 'Failed to get votes by date')
            return []
        }
    }

    /**
     * Get votes by position
     * @param {Object} query - MongoDB query
     * @returns {Promise<Array>} Votes grouped by position
     */
    async getVotesByPosition(query) {
        try {
            const votes = await Vote.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: '$positionId',
                        count: { $sum: 1 }
                    }
                }
            ])

            if (votes.length === 0) {
                return []
            }

            const positionIds = votes.map(v => v._id).filter(Boolean)
            const positions = await Position.find({
                _id: { $in: positionIds }
            })

            return votes.map(v => {
                const position = positions.find(p => p._id.toString() === v._id.toString())
                return {
                    positionId: v._id,
                    positionTitle: position?.title || 'Unknown',
                    count: v.count
                }
            })
        } catch (error) {
            logger.error({
                type: 'analytics_votes_by_position_error',
                error: error.message
            }, 'Failed to get votes by position')
            return []
        }
    }

    /**
     * Get turnout rate
     * @param {string} electionId - Election ID
     * @returns {Promise<Object>} Turnout statistics
     */
    async getTurnoutRate(electionId) {
        try {
            if (!electionId) {
                return { rate: 0, totalVoters: 0, votesCast: 0 }
            }

            const [totalVoters, votesCast] = await Promise.all([
                VoterRegistry.countDocuments({ electionId }),
                Vote.countDocuments({ electionId })
            ])

            return {
                rate: totalVoters > 0 ? Math.round((votesCast / totalVoters) * 100 * 100) / 100 : 0,
                totalVoters,
                votesCast
            }
        } catch (error) {
            logger.error({
                type: 'analytics_turnout_rate_error',
                error: error.message,
                electionId
            }, 'Failed to get turnout rate')
            return { rate: 0, totalVoters: 0, votesCast: 0 }
        }
    }

    /**
     * Get average votes per hour
     * @param {Object} query - MongoDB query
     * @returns {Promise<number>} Average votes per hour
     */
    async getAverageVotesPerHour(query) {
        try {
            const votes = await Vote.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d-%H', date: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                }
            ])

            if (votes.length === 0) {
                return 0
            }

            const totalVotes = votes.reduce((sum, v) => sum + v.count, 0)
            return Math.round((totalVotes / votes.length) * 100) / 100
        } catch (error) {
            logger.error({
                type: 'analytics_avg_votes_per_hour_error',
                error: error.message
            }, 'Failed to get average votes per hour')
            return 0
        }
    }

    /**
     * Get user behavior analytics
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} User behavior stats
     */
    async getUserBehaviorAnalytics(startDate, endDate) {
        try {
            const { start, end } = this.validateDateRange(startDate, endDate)
            const dateFilter = this.createDateFilter(start, end)

            const [
                newUsers,
                activeUsers,
                usersByRole,
                loginStats
            ] = await Promise.all([
                User.countDocuments(dateFilter),
                this.getActiveUsers(dateFilter),
                this.getUsersByRole(),
                this.getLoginStats(dateFilter)
            ])

            return {
                period: {
                    start,
                    end
                },
                newUsers,
                activeUsers,
                usersByRole,
                loginStats
            }
        } catch (error) {
            logger.error({
                type: 'analytics_user_behavior_error',
                error: error.message,
                stack: error.stack
            }, 'Failed to get user behavior analytics')
            throw error
        }
    }

    /**
     * Get active users (users who voted)
     * @param {Object} dateFilter - Date filter
     * @returns {Promise<number>} Active user count
     */
    async getActiveUsers(dateFilter) {
        try {
            const activeUserIds = await Vote.distinct('voterId', dateFilter)
            return activeUserIds.length
        } catch (error) {
            logger.error({
                type: 'analytics_active_users_error',
                error: error.message
            }, 'Failed to get active users')
            return 0
        }
    }

    /**
     * Get users by role
     * @returns {Promise<Array>} User counts by role
     */
    async getUsersByRole() {
        try {
            const users = await User.aggregate([
                {
                    $group: {
                        _id: '$role',
                        count: { $sum: 1 }
                    }
                }
            ])

            return users.map(u => ({
                role: u._id || 'unknown',
                count: u.count
            }))
        } catch (error) {
            logger.error({
                type: 'analytics_users_by_role_error',
                error: error.message
            }, 'Failed to get users by role')
            return []
        }
    }

    /**
     * Get login statistics
     * @param {Object} dateFilter - Date filter with createdAt field
     * @returns {Promise<Object>} Login stats
     */
    async getLoginStats(dateFilter) {
        try {
            const startDate = dateFilter?.createdAt?.$gte || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            const endDate = dateFilter?.createdAt?.$lte || new Date()

            const [stats, loginsByDate] = await Promise.all([
                LoginLog.getLoginStats(startDate, endDate),
                LoginLog.getLoginsByDate(startDate, endDate)
            ])

            const totalLogins = stats.totalLogins || 0
            const successfulLogins = stats.successfulLogins || 0

            return {
                ...stats,
                period: {
                    start: startDate,
                    end: endDate
                },
                loginsByDate: (loginsByDate || []).map(item => ({
                    date: item._id,
                    total: item.count || 0,
                    successful: item.successful || 0,
                    failed: item.failed || 0
                })),
                successRate: totalLogins > 0
                    ? Math.round((successfulLogins / totalLogins) * 100 * 100) / 100
                    : 0
            }
        } catch (error) {
            logger.error({
                type: 'analytics_login_stats_error',
                error: error.message,
                stack: error.stack
            }, 'Failed to get login statistics')
            throw error
        }
    }

    /**
     * Get poll analytics
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Poll analytics
     */
    async getPollAnalytics(startDate, endDate) {
        try {
            const { start, end } = this.validateDateRange(startDate, endDate)
            const dateFilter = this.createDateFilter(start, end)

            const [totalPolls, totalVotes, pollsByCategory, pollsByType] = await Promise.all([
                Poll.countDocuments(dateFilter),
                PollVote.countDocuments(dateFilter),
                this.getPollsByCategory(dateFilter),
                this.getPollsByType(dateFilter)
            ])

            return {
                period: {
                    start,
                    end
                },
                totalPolls,
                totalVotes,
                pollsByCategory,
                pollsByType,
                averageVotesPerPoll: totalPolls > 0
                    ? Math.round((totalVotes / totalPolls) * 100) / 100
                    : 0
            }
        } catch (error) {
            logger.error({
                type: 'analytics_poll_error',
                error: error.message,
                stack: error.stack
            }, 'Failed to get poll analytics')
            throw error
        }
    }

    /**
     * Get polls by category
     * @param {Object} dateFilter - Date filter
     * @returns {Promise<Array>} Polls grouped by category
     */
    async getPollsByCategory(dateFilter) {
        try {
            const polls = await Poll.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ])

            return polls.map(p => ({
                category: p._id || 'uncategorized',
                count: p.count
            }))
        } catch (error) {
            logger.error({
                type: 'analytics_polls_by_category_error',
                error: error.message
            }, 'Failed to get polls by category')
            return []
        }
    }

    /**
     * Get polls by type
     * @param {Object} dateFilter - Date filter
     * @returns {Promise<Array>} Polls grouped by type
     */
    async getPollsByType(dateFilter) {
        try {
            const polls = await Poll.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$pollType',
                        count: { $sum: 1 }
                    }
                }
            ])

            return polls.map(p => ({
                type: p._id || 'unknown',
                count: p.count
            }))
        } catch (error) {
            logger.error({
                type: 'analytics_polls_by_type_error',
                error: error.message
            }, 'Failed to get polls by type')
            return []
        }
    }
}

module.exports = new AnalyticsService()