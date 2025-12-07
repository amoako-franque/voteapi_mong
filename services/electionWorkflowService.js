const Election = require('../models/Election')
const Vote = require('../models/Vote')
const Candidate = require('../models/Candidate')
const notificationService = require('./notificationService')
const logger = require('../utils/logger')
const { ELECTION_PHASES, ELECTION_STATUS } = require('../utils/constants')

/**
 * Election Workflow Service
 * Manages election phase transitions and automated workflows
 */
class ElectionWorkflowService {
    /**
     * Update election phase based on current date/time
     * @param {Object} election - Election document
     * @returns {Object} Updated election
     */
    async updateElectionPhase(election) {
        try {
            const now = new Date()
            let phaseChanged = false
            const previousPhase = election.currentPhase

            // Update phase using the model method
            election.updatePhase()

            // Check if phase actually changed
            if (election.currentPhase !== previousPhase) {
                phaseChanged = true
                logger.info({
                    type: 'election_phase_changed',
                    electionId: election._id,
                    previousPhase,
                    newPhase: election.currentPhase,
                    electionTitle: election.title
                }, `Election phase changed from ${ previousPhase } to ${ election.currentPhase }`)
            }

            // Auto-activate election when voting starts
            if (election.status === ELECTION_STATUS.SCHEDULED &&
                election.currentPhase === ELECTION_PHASES.VOTING &&
                now >= election.startDateTime &&
                now <= election.endDateTime) {
                election.status = ELECTION_STATUS.ACTIVE
                logger.info({
                    type: 'election_auto_activated',
                    electionId: election._id,
                    electionTitle: election.title
                }, 'Election automatically activated for voting')
            }

            // Auto-complete election when voting ends
            if (election.status === ELECTION_STATUS.ACTIVE &&
                election.currentPhase === ELECTION_PHASES.RESULTS &&
                now > election.endDateTime) {
                election.status = ELECTION_STATUS.COMPLETED
                logger.info({
                    type: 'election_auto_completed',
                    electionId: election._id,
                    electionTitle: election.title
                }, 'Election automatically completed')
            }

            // Save if phase or status changed
            if (phaseChanged || election.isModified()) {
                await election.save()
            }

            return election
        } catch (error) {
            logger.error({
                type: 'update_election_phase_error',
                error: error.message,
                electionId: election._id
            }, 'Failed to update election phase')
            throw error
        }
    }

    /**
     * Process all elections and update their phases
     * Called by background job
     */
    async processAllElections() {
        try {
            const now = new Date()

            // Get all active and scheduled elections
            const elections = await Election.find({
                status: { $in: [ELECTION_STATUS.DRAFT, ELECTION_STATUS.SCHEDULED, ELECTION_STATUS.ACTIVE] }
            })

            logger.info({
                type: 'process_elections_start',
                count: elections.length
            }, `Processing ${ elections.length } elections`)

            let updated = 0
            for (const election of elections) {
                try {
                    await this.updateElectionPhase(election)
                    updated++
                } catch (error) {
                    logger.error({
                        type: 'process_election_error',
                        error: error.message,
                        electionId: election._id
                    }, `Failed to process election ${ election._id }`)
                }
            }

            logger.info({
                type: 'process_elections_complete',
                total: elections.length,
                updated
            }, `Processed ${ updated } of ${ elections.length } elections`)

            return { total: elections.length, updated }
        } catch (error) {
            logger.error({
                type: 'process_all_elections_error',
                error: error.message
            }, 'Failed to process all elections')
            throw error
        }
    }

    /**
     * Manually advance election phase
     * @param {String} electionId - Election ID
     * @param {String} targetPhase - Target phase
     * @param {String} userId - User ID performing the action
     */
    async advancePhase(electionId, targetPhase, userId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            // Validate phase transition
            const validPhases = Object.values(ELECTION_PHASES)
            if (!validPhases.includes(targetPhase)) {
                throw new Error(`Invalid phase: ${ targetPhase }`)
            }

            const previousPhase = election.currentPhase
            election.currentPhase = targetPhase

            // Update status based on phase
            if (targetPhase === ELECTION_PHASES.VOTING && election.status === ELECTION_STATUS.SCHEDULED) {
                election.status = ELECTION_STATUS.ACTIVE
            } else if (targetPhase === ELECTION_PHASES.RESULTS && election.status === ELECTION_STATUS.ACTIVE) {
                // Keep as ACTIVE until manually completed or auto-completed
            } else if (targetPhase === ELECTION_PHASES.COMPLETED) {
                election.status = ELECTION_STATUS.COMPLETED
            }

            await election.save()

            logger.info({
                type: 'election_phase_advanced',
                electionId: election._id,
                previousPhase,
                newPhase: targetPhase,
                userId,
                electionTitle: election.title
            }, `Election phase manually advanced from ${ previousPhase } to ${ targetPhase }`)

            return election
        } catch (error) {
            logger.error({
                type: 'advance_phase_error',
                error: error.message,
                electionId,
                targetPhase
            }, 'Failed to advance election phase')
            throw error
        }
    }

    /**
     * Start voting period manually
     * @param {String} electionId - Election ID
     * @param {String} userId - User ID performing the action
     */
    async startVoting(electionId, userId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            if (election.status === ELECTION_STATUS.ACTIVE && election.currentPhase === ELECTION_PHASES.VOTING) {
                throw new Error('Voting has already started')
            }

            election.status = ELECTION_STATUS.ACTIVE
            election.currentPhase = ELECTION_PHASES.VOTING
            await election.save()

            logger.info({
                type: 'voting_started',
                electionId: election._id,
                userId,
                electionTitle: election.title
            }, 'Voting period started manually')

            return election
        } catch (error) {
            logger.error({
                type: 'start_voting_error',
                error: error.message,
                electionId
            }, 'Failed to start voting')
            throw error
        }
    }

    /**
     * Close voting period manually
     * @param {String} electionId - Election ID
     * @param {String} userId - User ID performing the action
     */
    async closeVoting(electionId, userId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            if (election.currentPhase !== ELECTION_PHASES.VOTING) {
                throw new Error('Election is not in voting phase')
            }

            election.currentPhase = ELECTION_PHASES.RESULTS
            await election.save()

            logger.info({
                type: 'voting_closed',
                electionId: election._id,
                userId,
                electionTitle: election.title
            }, 'Voting period closed manually')

            return election
        } catch (error) {
            logger.error({
                type: 'close_voting_error',
                error: error.message,
                electionId
            }, 'Failed to close voting')
            throw error
        }
    }

    /**
     * Complete election and finalize results
     * @param {String} electionId - Election ID
     * @param {String} userId - User ID performing the action
     */
    async completeElection(electionId, userId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            election.status = ELECTION_STATUS.COMPLETED
            election.currentPhase = ELECTION_PHASES.COMPLETED
            await election.save()

            logger.info({
                type: 'election_completed',
                electionId: election._id,
                userId,
                electionTitle: election.title
            }, 'Election completed and finalized')

            return election
        } catch (error) {
            logger.error({
                type: 'complete_election_error',
                error: error.message,
                electionId
            }, 'Failed to complete election')
            throw error
        }
    }

    /**
     * Generate and send provisional results to candidates
     * @param {String} electionId - Election ID
     */
    async sendProvisionalResults(electionId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            if (election.currentPhase !== ELECTION_PHASES.RESULTS) {
                throw new Error('Election must be in RESULTS phase to send provisional results')
            }

            // Get all candidates for this election
            const candidates = await Candidate.find({
                electionId: election._id,
                status: 'APPROVED'
            }).populate('voterId', 'email fullName')

            // Get vote counts for each candidate
            const voteCounts = await Vote.aggregate([
                {
                    $match: {
                        electionId: election._id,
                        status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
                    }
                },
                {
                    $group: {
                        _id: '$candidateId',
                        voteCount: { $sum: 1 }
                    }
                }
            ])

            // Create a map of candidate votes
            const candidateVoteMap = {}
            voteCounts.forEach(item => {
                candidateVoteMap[item._id?.toString()] = item.voteCount || 0
            })

            // Send provisional results to each candidate
            const emailPromises = candidates.map(async (candidate) => {
                try {
                    const voteCount = candidateVoteMap[candidate._id.toString()] || 0
                    const totalVotes = voteCounts.reduce((sum, item) => sum + item.voteCount, 0)
                    const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0

                    // Send email with provisional results
                    await notificationService.sendProvisionalResults({
                        candidate: candidate,
                        election: election,
                        voteCount,
                        totalVotes,
                        percentage,
                        position: await require('../models/Position').findById(candidate.positionId)
                    })
                } catch (error) {
                    logger.error({
                        type: 'send_provisional_results_email_error',
                        error: error.message,
                        candidateId: candidate._id,
                        electionId
                    }, `Failed to send provisional results to candidate ${ candidate._id }`)
                }
            })

            await Promise.all(emailPromises)

            logger.info({
                type: 'provisional_results_sent',
                electionId: election._id,
                candidatesCount: candidates.length
            }, `Provisional results sent to ${ candidates.length } candidates`)

            return {
                electionId: election._id,
                candidatesNotified: candidates.length,
                totalVotes: voteCounts.reduce((sum, item) => sum + item.voteCount, 0)
            }
        } catch (error) {
            logger.error({
                type: 'send_provisional_results_error',
                error: error.message,
                electionId
            }, 'Failed to send provisional results')
            throw error
        }
    }
}

module.exports = new ElectionWorkflowService()

