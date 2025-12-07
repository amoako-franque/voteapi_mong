const cron = require('node-cron')
const electionWorkflowService = require('./electionWorkflowService')
const pollService = require('./pollService')
const notificationService = require('./notificationService')
const logger = require('../utils/logger')
const { ELECTION_STATUS, ELECTION_PHASES } = require('../utils/constants')
const Election = require('../models/Election')
const VoterRegistry = require('../models/VoterRegistry')
const Candidate = require('../models/Candidate')

/**
 * Background Job Service
 * Manages scheduled tasks and cron jobs
 */
class BackgroundJobService {
    constructor() {
        this.jobs = []
        this.isRunning = false
    }

    /**
     * Initialize all background jobs
     */
    initialize() {
        if (this.isRunning) {
            logger.warn('Background jobs already initialized')
            return { initialized: true, jobs: [] }
        }

        // Job 1: Process election phases every minute
        this.scheduleElectionPhaseUpdates()

        // Job 2: Send deadline reminders (daily at 9 AM)
        this.scheduleDeadlineReminders()

        // Job 3: Cleanup expired tokens (daily at 2 AM)
        this.scheduleTokenCleanup()

        // Job 4: Auto-send provisional results when voting closes
        this.scheduleProvisionalResults()

        // Job 5: Process ended polls and send results (every 5 minutes)
        this.schedulePollResults()

        // Job 6: Update poll statuses (every minute)
        this.schedulePollStatusUpdates()

        this.isRunning = true

        return {
            initialized: true,
            jobs: [
                'Election phase updates (every minute)',
                'Deadline reminders (daily at 9 AM UTC)',
                'Token cleanup (daily at 2 AM UTC)',
                'Provisional results (every 5 minutes)',
                'Poll results processing (every 5 minutes)',
                'Poll status updates (every minute)'
            ]
        }
    }

    /**
     * Schedule election phase updates (runs every minute)
     */
    scheduleElectionPhaseUpdates() {
        const job = cron.schedule('* * * * *', async () => {
            try {
                await electionWorkflowService.processAllElections()
            } catch (error) {
                logger.error({
                    type: 'election_phase_update_job_error',
                    error: error.message
                }, 'Failed to process election phase updates')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'electionPhaseUpdates', job })
    }

    /**
     * Schedule deadline reminders (daily at 9 AM)
     */
    scheduleDeadlineReminders() {
        const job = cron.schedule('0 9 * * *', async () => {
            try {
                await this.sendDeadlineReminders()
            } catch (error) {
                logger.error({
                    type: 'deadline_reminders_job_error',
                    error: error.message
                }, 'Failed to send deadline reminders')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'deadlineReminders', job })
    }

    /**
     * Send deadline reminders for upcoming deadlines
     */
    async sendDeadlineReminders() {
        try {
            const now = new Date()
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(23, 59, 59, 999)

            // Find elections with deadlines in the next 24 hours
            const elections = await Election.find({
                status: { $in: ['SCHEDULED', 'DRAFT', 'ACTIVE'] },
                $or: [
                    { registrationDeadline: { $gte: now, $lte: tomorrow } },
                    { candidateNominationDeadline: { $gte: now, $lte: tomorrow } },
                    { 'campaignPeriod.endDate': { $gte: now, $lte: tomorrow } },
                    { startDateTime: { $gte: now, $lte: tomorrow } },
                    { endDateTime: { $gte: now, $lte: tomorrow } }
                ]
            })

            logger.info({
                type: 'deadline_reminders_start',
                electionsCount: elections.length
            }, `Processing deadline reminders for ${ elections.length } elections`)

            let remindersSent = 0

            for (const election of elections) {
                try {
                    // Check registration deadline
                    if (election.registrationDeadline &&
                        election.registrationDeadline >= now &&
                        election.registrationDeadline <= tomorrow) {
                        await this.sendRegistrationDeadlineReminder(election)
                        remindersSent++
                    }

                    // Check nomination deadline
                    if (election.candidateNominationDeadline &&
                        election.candidateNominationDeadline >= now &&
                        election.candidateNominationDeadline <= tomorrow) {
                        await this.sendNominationDeadlineReminder(election)
                        remindersSent++
                    }

                    // Check campaign end deadline
                    if (election.campaignPeriod?.endDate &&
                        election.campaignPeriod.endDate >= now &&
                        election.campaignPeriod.endDate <= tomorrow) {
                        await this.sendCampaignEndReminder(election)
                        remindersSent++
                    }

                    // Check voting start
                    if (election.startDateTime >= now &&
                        election.startDateTime <= tomorrow) {
                        await this.sendVotingStartReminder(election)
                        remindersSent++
                    }

                    // Check voting end
                    if (election.endDateTime >= now &&
                        election.endDateTime <= tomorrow) {
                        await this.sendVotingEndReminder(election)
                        remindersSent++
                    }
                } catch (error) {
                    logger.error({
                        type: 'deadline_reminder_error',
                        electionId: election._id,
                        error: error.message
                    }, `Failed to send deadline reminder for election ${ election._id }`)
                }
            }

            logger.info({
                type: 'deadline_reminders_complete',
                electionsProcessed: elections.length,
                remindersSent
            }, `Sent ${ remindersSent } deadline reminders`)
        } catch (error) {
            logger.error({
                type: 'deadline_reminders_job_error',
                error: error.message
            }, 'Failed to process deadline reminders')
            throw error
        }
    }

    /**
     * Send registration deadline reminder
     */
    async sendRegistrationDeadlineReminder(election) {
        const voters = await VoterRegistry.find({
            electionId: election._id,
            verified: false
        })

        for (const voter of voters) {
            await notificationService.createNotification({
                type: 'ELECTION_REMINDER',
                title: `Registration Deadline Reminder - ${ election.title }`,
                message: `The registration deadline for "${ election.title }" is approaching. Please complete your registration to be eligible to vote.`,
                recipientId: voter._id,
                electionId: election._id,
                channel: 'EMAIL',
                metadata: {
                    deadlineType: 'REGISTRATION',
                    deadlineDate: election.registrationDeadline
                }
            })
        }
    }

    /**
     * Send nomination deadline reminder
     */
    async sendNominationDeadlineReminder(election) {
        // Notify admins and potential candidates
        const candidates = await Candidate.find({
            electionId: election._id,
            status: { $ne: 'APPROVED' }
        })

        for (const candidate of candidates) {
            if (candidate.voterId) {
                const voter = await VoterRegistry.findById(candidate.voterId)
                if (voter) {
                    await notificationService.createNotification({
                        type: 'ELECTION_REMINDER',
                        title: `Nomination Deadline Reminder - ${ election.title }`,
                        message: `The candidate nomination deadline for "${ election.title }" is approaching. Please ensure your nomination is complete.`,
                        recipientId: voter._id,
                        electionId: election._id,
                        channel: 'EMAIL',
                        metadata: {
                            deadlineType: 'NOMINATION',
                            deadlineDate: election.candidateNominationDeadline
                        }
                    })
                }
            }
        }
    }

    /**
     * Send campaign end reminder
     */
    async sendCampaignEndReminder(election) {
        const candidates = await Candidate.find({
            electionId: election._id,
            status: 'APPROVED'
        })

        for (const candidate of candidates) {
            if (candidate.voterId) {
                const voter = await VoterRegistry.findById(candidate.voterId)
                if (voter) {
                    await notificationService.createNotification({
                        type: 'ELECTION_REMINDER',
                        title: `Campaign Period Ending - ${ election.title }`,
                        message: `The campaign period for "${ election.title }" is ending soon. Voting will begin shortly.`,
                        recipientId: voter._id,
                        electionId: election._id,
                        channel: 'EMAIL',
                        metadata: {
                            deadlineType: 'CAMPAIGN_END',
                            deadlineDate: election.campaignPeriod.endDate
                        }
                    })
                }
            }
        }
    }

    /**
     * Send voting start reminder
     */
    async sendVotingStartReminder(election) {
        const voters = await VoterRegistry.find({
            electionId: election._id,
            verified: true,
            eligible: true
        })

        const emailService = require('./emailService')

        for (const voter of voters) {
            // Send via notification service
            await notificationService.createNotification({
                type: 'VOTING_OPEN',
                title: `Voting Now Open - ${ election.title }`,
                message: `Voting for "${ election.title }" is now open! Please cast your vote before the deadline.`,
                recipientId: voter._id,
                electionId: election._id,
                channel: 'EMAIL',
                metadata: {
                    deadlineType: 'VOTING_START',
                    deadlineDate: election.startDateTime
                }
            })

            // Also send using template
            try {
                await emailService.sendElectionPeriodNotification({
                    to: voter.email,
                    election
                })
            } catch (error) {
                logger.error({
                    type: 'voting_start_reminder_email_error',
                    error: error.message,
                    voterId: voter._id
                }, 'Failed to send voting start reminder email')
            }
        }
    }

    /**
     * Send voting end reminder
     */
    async sendVotingEndReminder(election) {
        const voters = await VoterRegistry.find({
            electionId: election._id,
            verified: true,
            eligible: true
        })

        // Get voters who haven't voted yet
        const Vote = require('../models/Vote')
        const votersWhoVoted = await Vote.distinct('voterId', { electionId: election._id })
        const votersToRemind = voters.filter(v => !votersWhoVoted.includes(v._id.toString()))

        for (const voter of votersToRemind) {
            await notificationService.createNotification({
                type: 'ELECTION_REMINDER',
                title: `Last Chance to Vote - ${ election.title }`,
                message: `Voting for "${ election.title }" is ending soon! Please cast your vote before the deadline.`,
                recipientId: voter._id,
                electionId: election._id,
                channel: 'EMAIL',
                metadata: {
                    deadlineType: 'VOTING_END',
                    deadlineDate: election.endDateTime
                }
            })
        }
    }

    /**
     * Schedule token cleanup (daily at 2 AM)
     */
    scheduleTokenCleanup() {
        const job = cron.schedule('0 2 * * *', async () => {
            try {
                const Token = require('../models/Token')
                const now = new Date()

                // Delete expired tokens
                const result = await Token.deleteMany({
                    expiresAt: { $lt: now }
                })

                logger.info({
                    type: 'token_cleanup',
                    deletedCount: result.deletedCount
                }, `Cleaned up ${ result.deletedCount } expired tokens`)
            } catch (error) {
                logger.error({
                    type: 'token_cleanup_job_error',
                    error: error.message
                }, 'Failed to cleanup expired tokens')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'tokenCleanup', job })
    }

    /**
     * Schedule provisional results (runs every 5 minutes to check for closed elections)
     */
    scheduleProvisionalResults() {
        const job = cron.schedule('*/5 * * * *', async () => {
            try {
                const Election = require('../models/Election')
                const now = new Date()

                // Find elections that just closed (in last 5 minutes) and are in RESULTS phase
                const recentlyClosedElections = await Election.find({
                    status: ELECTION_STATUS.ACTIVE,
                    currentPhase: ELECTION_PHASES.RESULTS,
                    endDateTime: {
                        $gte: new Date(now.getTime() - 5 * 60 * 1000), // Last 5 minutes
                        $lte: now
                    },
                    'metadata.provisionalResultsSent': { $ne: true }
                })

                for (const election of recentlyClosedElections) {
                    try {
                        await electionWorkflowService.sendProvisionalResults(election._id)

                        // Mark as sent
                        if (!election.metadata) election.metadata = {}
                        election.metadata.provisionalResultsSent = true
                        election.metadata.provisionalResultsSentAt = new Date()
                        await election.save()
                    } catch (error) {
                        logger.error({
                            type: 'auto_send_provisional_results_error',
                            error: error.message,
                            electionId: election._id
                        }, `Failed to auto-send provisional results for election ${ election._id }`)
                    }
                }

                if (recentlyClosedElections.length > 0) {
                    logger.info({
                        type: 'provisional_results_auto_sent',
                        count: recentlyClosedElections.length
                    }, `Auto-sent provisional results for ${ recentlyClosedElections.length } elections`)
                }
            } catch (error) {
                logger.error({
                    type: 'provisional_results_job_error',
                    error: error.message
                }, 'Failed to process provisional results job')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'provisionalResults', job })
    }

    /**
     * Schedule poll results processing (every 5 minutes)
     */
    schedulePollResults() {
        const job = cron.schedule('*/5 * * * *', async () => {
            try {
                await pollService.processEndedPolls()
            } catch (error) {
                logger.error({
                    type: 'poll_results_job_error',
                    error: error.message
                }, 'Failed to process poll results')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'pollResults', job })
    }

    /**
     * Schedule poll status updates (every minute)
     */
    schedulePollStatusUpdates() {
        const job = cron.schedule('* * * * *', async () => {
            try {
                await pollService.updatePollStatuses()
            } catch (error) {
                logger.error({
                    type: 'poll_status_update_job_error',
                    error: error.message
                }, 'Failed to update poll statuses')
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        })

        this.jobs.push({ name: 'pollStatusUpdates', job })
    }

    /**
     * Stop all background jobs
     */
    stop() {
        this.jobs.forEach(({ name, job }) => {
            job.stop()
            logger.info(`Stopped background job: ${ name }`)
        })
        this.jobs = []
        this.isRunning = false
        logger.info('All background jobs stopped')
    }

    /**
     * Get status of all jobs
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            jobsCount: this.jobs.length,
            jobs: this.jobs.map(({ name }) => name)
        }
    }
}

module.exports = new BackgroundJobService()

