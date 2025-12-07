const Poll = require('../models/Poll')
const PollVote = require('../models/PollVote')
const User = require('../models/User')
const emailService = require('./emailService')
const notificationService = require('./notificationService')
const logger = require('../utils/logger')

/**
 * Send poll results to registered voters and creator
 * Called when a poll ends
 */
const sendPollResults = async (pollId) => {
    try {
        const poll = await Poll.findById(pollId)
            .populate('createdBy', 'email firstname lastname')

        if (!poll) {
            logger.error({ type: 'poll_not_found', pollId }, 'Poll not found for results')
            return
        }

        // Check if results already sent
        if (poll.resultsSent) {
            logger.info({ type: 'results_already_sent', pollId }, 'Results already sent for this poll')
            return
        }

        // Get poll results
        const results = await poll.getResults()

        // Send results to creator if registered and setting enabled
        if (poll.settings.sendResultsToCreator && poll.createdBy && poll.createdBy.email) {
            try {
                await emailService.sendPollResultsToCreator({
                    to: poll.createdBy.email,
                    pollTitle: poll.title,
                    pollSubject: poll.subject.name,
                    results: results.statistics,
                    pollId: poll._id
                })

                logger.info({
                    type: 'poll_results_sent_creator',
                    pollId: poll._id,
                    email: poll.createdBy.email
                }, 'Poll results sent to creator')
            } catch (error) {
                logger.error({
                    type: 'poll_results_email_error',
                    pollId: poll._id,
                    error: error.message
                }, 'Error sending results email to creator')
            }
        }

        // Send results to registered voters who participated
        if (poll.settings.sendResultsToVoters) {
            const registeredVotes = await PollVote.find({
                pollId: poll._id,
                userId: { $ne: null }
            }).populate('userId', 'email firstname lastname')

            const uniqueUsers = new Map()
            registeredVotes.forEach(vote => {
                if (vote.userId && vote.userId.email) {
                    uniqueUsers.set(vote.userId._id.toString(), vote.userId)
                }
            })

            // Send email to each unique registered voter
            for (const [userId, user] of uniqueUsers) {
                try {
                    await emailService.sendPollResultsToVoter({
                        to: user.email,
                        pollTitle: poll.title,
                        pollSubject: poll.subject.name,
                        results: results.statistics,
                        pollId: poll._id,
                        voterName: `${ user.firstname } ${ user.lastname }`
                    })

                    logger.info({
                        type: 'poll_results_sent_voter',
                        pollId: poll._id,
                        userId: userId,
                        email: user.email
                    }, 'Poll results sent to voter')
                } catch (error) {
                    logger.error({
                        type: 'poll_results_email_error',
                        pollId: poll._id,
                        userId: userId,
                        error: error.message
                    }, 'Error sending results email to voter')
                }
            }
        }

        // Mark results as sent
        poll.resultsSent = true
        poll.resultsSentAt = new Date()
        await poll.save()

        logger.info({
            type: 'poll_results_sent_complete',
            pollId: poll._id
        }, 'Poll results sent successfully')

    } catch (error) {
        logger.error({
            type: 'send_poll_results_error',
            pollId,
            error: error.message,
            stack: error.stack
        }, 'Error sending poll results')
        throw error
    }
}

/**
 * Check for ended polls and send results
 * Should be called periodically (e.g., via cron job)
 */
const processEndedPolls = async () => {
    try {
        const now = new Date()

        // Find polls that have ended but results haven't been sent
        const endedPolls = await Poll.find({
            status: 'ENDED',
            endDate: { $lte: now },
            resultsSent: false
        })

        logger.info({
            type: 'process_ended_polls',
            count: endedPolls.length
        }, `Processing ${ endedPolls.length } ended polls`)

        for (const poll of endedPolls) {
            try {
                await sendPollResults(poll._id)
            } catch (error) {
                logger.error({
                    type: 'process_poll_error',
                    pollId: poll._id,
                    error: error.message
                }, `Error processing poll ${ poll._id }`)
                // Continue with other polls even if one fails
            }
        }

        return {
            processed: endedPolls.length,
            success: true
        }
    } catch (error) {
        logger.error({
            type: 'process_ended_polls_error',
            error: error.message
        }, 'Error processing ended polls')
        throw error
    }
}

/**
 * Update poll status based on dates
 * Should be called periodically
 */
const updatePollStatuses = async () => {
    try {
        const now = new Date()

        // Update polls that should be active
        await Poll.updateMany(
            {
                status: { $in: ['DRAFT', 'ACTIVE'] },
                startDate: { $lte: now },
                endDate: { $gte: now }
            },
            {
                $set: { status: 'ACTIVE' }
            }
        )

        // Update polls that should be ended
        await Poll.updateMany(
            {
                status: { $ne: 'ENDED' },
                endDate: { $lt: now }
            },
            {
                $set: { status: 'ENDED' }
            }
        )

        logger.info({
            type: 'poll_statuses_updated',
            timestamp: now
        }, 'Poll statuses updated')
    } catch (error) {
        logger.error({
            type: 'update_poll_statuses_error',
            error: error.message
        }, 'Error updating poll statuses')
        throw error
    }
}

module.exports = {
    sendPollResults,
    processEndedPolls,
    updatePollStatuses
}

