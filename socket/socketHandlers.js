const Vote = require('../models/Vote')
const Election = require('../models/Election')
const Notification = require('../models/Notification')
const logger = require('../utils/logger')

/**
 * Socket event handlers for real-time vote counting and notifications
 */
class SocketHandlers {
    constructor(io) {
        this.io = io
    }

    /**
     * Send in-app notification to a user
     */
    async sendNotification(userId, notification) {
        try {
            // Emit to user's personal room
            this.io.to(`user:${userId}`).emit('notification:new', {
                ...notification.toObject(),
                timestamp: new Date()
            })

            logger.debug({
                type: 'socket_notification_sent',
                userId,
                notificationId: notification._id
            }, 'In-app notification sent via Socket.io')
        } catch (error) {
            logger.error({
                type: 'socket_notification_error',
                error: error.message,
                userId,
                notificationId: notification._id
            }, 'Failed to send in-app notification')
        }
    }

    /**
     * Mark notification as read via socket
     */
    async markNotificationRead(userId, notificationId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                recipientId: userId
            })

            if (notification) {
                notification.readAt = new Date()
                await notification.save()

                // Emit update to user
                this.io.to(`user:${userId}`).emit('notification:read', {
                    notificationId,
                    readAt: notification.readAt
                })
            }
        } catch (error) {
            logger.error({
                type: 'socket_notification_read_error',
                error: error.message,
                userId,
                notificationId
            }, 'Failed to mark notification as read')
        }
    }

    /**
     * Emit vote cast event
     */
    emitVoteCast(voteData) {
        try {
            const { electionId, positionId } = voteData

            // Emit to specific election room
            this.io.to(`election:${ electionId }`).emit('vote:cast', {
                ...voteData,
                timestamp: new Date()
            })

            // Emit to admin room
            this.io.to('admin').emit('vote:cast', {
                ...voteData,
                timestamp: new Date()
            })

            // Update vote counts
            this.updateVoteCounts(electionId, positionId)
        } catch (error) {
            logger.error({
                type: 'socket_emit_vote_cast_error',
                error: error.message,
                voteData
            }, 'Failed to emit vote cast event')
        }
    }

    /**
     * Update and emit vote counts for a position
     */
    async updateVoteCounts(electionId, positionId) {
        try {
            const voteCounts = await Vote.aggregate([
                {
                    $match: {
                        electionId: require('mongoose').Types.ObjectId(electionId),
                        positionId: require('mongoose').Types.ObjectId(positionId),
                        status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] },
                        isAbstention: false
                    }
                },
                {
                    $group: {
                        _id: '$candidateId',
                        totalVotes: { $sum: 1 }
                    }
                },
                {
                    $sort: { totalVotes: -1 }
                }
            ])

            const totalVotes = await Vote.countDocuments({
                electionId,
                positionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            // Emit updated vote counts
            this.io.to(`election:${ electionId }`).emit('vote:counts', {
                electionId,
                positionId,
                counts: voteCounts,
                totalVotes,
                timestamp: new Date()
            })

            // Emit to admin room
            this.io.to('admin').emit('vote:counts', {
                electionId,
                positionId,
                counts: voteCounts,
                totalVotes,
                timestamp: new Date()
            })
        } catch (error) {
            logger.error({
                type: 'socket_update_vote_counts_error',
                error: error.message,
                electionId,
                positionId
            }, 'Failed to update vote counts')
        }
    }

    /**
     * Emit results update
     */
    async emitResultsUpdate(electionId, results) {
        try {
            // Emit to specific election room
            this.io.to(`election:${ electionId }`).emit('results:updated', {
                electionId,
                results,
                timestamp: new Date()
            })

            // Emit to admin room
            this.io.to('admin').emit('results:updated', {
                electionId,
                results,
                timestamp: new Date()
            })
        } catch (error) {
            logger.error({
                type: 'socket_emit_results_update_error',
                error: error.message,
                electionId
            }, 'Failed to emit results update')
        }
    }

    /**
     * Emit election phase change
     */
    emitPhaseChange(electionId, phase) {
        try {
            this.io.to(`election:${ electionId }`).emit('election:phase-change', {
                electionId,
                phase,
                timestamp: new Date()
            })

            this.io.to('admin').emit('election:phase-change', {
                electionId,
                phase,
                timestamp: new Date()
            })
        } catch (error) {
            logger.error({
                type: 'socket_emit_phase_change_error',
                error: error.message,
                electionId,
                phase
            }, 'Failed to emit phase change')
        }
    }

    /**
     * Get current vote counts for a position (for clients joining mid-election)
     */
    async getCurrentVoteCounts(electionId, positionId) {
        try {
            const voteCounts = await Vote.aggregate([
                {
                    $match: {
                        electionId: require('mongoose').Types.ObjectId(electionId),
                        positionId: require('mongoose').Types.ObjectId(positionId),
                        status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] },
                        isAbstention: false
                    }
                },
                {
                    $group: {
                        _id: '$candidateId',
                        totalVotes: { $sum: 1 }
                    }
                },
                {
                    $sort: { totalVotes: -1 }
                }
            ])

            const totalVotes = await Vote.countDocuments({
                electionId,
                positionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            return {
                electionId,
                positionId,
                counts: voteCounts,
                totalVotes,
                timestamp: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'socket_get_current_vote_counts_error',
                error: error.message,
                electionId,
                positionId
            }, 'Failed to get current vote counts')
            throw error
        }
    }
}

module.exports = SocketHandlers
