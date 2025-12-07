const mongoose = require('mongoose')
const School = require('../../models/School')
const Association = require('../../models/Association')
const responseFormatter = require('../../utils/responseFormatter')
const logger = require('../../utils/logger')
const Election = require('../../models/Election')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Create a new election
 * - User cannot be ELECTION_OFFICER
 * - Must create School or professional association first based on election scope
 */
const createElection = async (req, res) => {
    try {
        const userId = req.user.id
        const userRole = req.user.role

        if (userRole === 'ELECTION_OFFICER') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Election officers cannot create elections', HTTP_STATUS.FORBIDDEN)
            )
        }

        const {
            title,
            description,
            type,
            scope,
            startDateTime,
            endDateTime,
            timezone,
            schoolId,
            associationId,
            associationCode,
            settings,
            votingRules,
            registrationDeadline,
            campaignPeriod,
            candidateNominationDeadline
        } = req.body

        // Validate scope and required entity
        if (scope === 'SCHOOL' && !schoolId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('School ID is required for school elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (scope === 'ASSOCIATION') {
            if (!associationId && !associationCode) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Association ID or code is required for association elections', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Verify School exists if provided (for SCHOOL scope)
        if (scope === 'SCHOOL' && schoolId) {
            const school = await School.findById(schoolId)
            if (!school) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
                )
            }
            if (!school.isActive || !school.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('School must be active and verified', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Verify Association exists if provided (for ASSOCIATION scope)
        if (scope === 'ASSOCIATION') {
            let association
            if (associationId) {
                association = await Association.findById(associationId)
            } else if (associationCode) {
                association = await Association.findOne({ code: associationCode.toUpperCase() })
            }

            if (!association) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
                )
            }

            if (!association.isActive || !association.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Association must be active and verified', HTTP_STATUS.BAD_REQUEST)
                )
            }

            associationId = association._id
        }

        // Create election
        const election = await Election.create({
            title,
            description,
            type,
            scope,
            startDateTime: new Date(startDateTime),
            endDateTime: new Date(endDateTime),
            timezone: timezone || 'Africa/Accra',
            schoolId: scope === 'SCHOOL' ? schoolId : undefined,
            associationId: scope === 'ASSOCIATION' ? associationId : undefined,
            settings: settings || {},
            votingRules: votingRules || {},
            registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : undefined,
            candidateNominationDeadline: candidateNominationDeadline ? new Date(candidateNominationDeadline) : undefined,
            campaignPeriod: campaignPeriod ? {
                startDate: new Date(campaignPeriod.startDate),
                endDate: new Date(campaignPeriod.endDate)
            } : undefined,
            createdBy: userId,
            status: 'DRAFT',
            currentPhase: 'REGISTRATION'
        })

        logger.info({
            type: 'election_created',
            electionId: election._id,
            userId,
            scope
        }, 'Election created successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(election, 'Election created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'election_creation_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to create election')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get elections created by the user
 */
const getMyElections = async (req, res) => {
    try {
        const userId = req.user.id
        const { status, scope, page = 1, limit = 10 } = req.query

        const query = { createdBy: userId }
        if (status) query.status = status
        if (scope) query.scope = scope

        const elections = await Election.find(query)
            .populate('schoolId', 'name shortName code')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)

        const total = await Election.countDocuments(query)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                elections,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }, 'Elections retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_elections_error',
            error: error.message
        }, 'Failed to retrieve elections')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve elections', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a single election by ID (only if user created it)
 * Includes results if voting has ended
 */
const getElection = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const election = await Election.findOne({
            _id: electionId,
            createdBy: userId
        })
            .populate('schoolId', 'name shortName code')
            .populate('createdBy', 'firstname lastname email')

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found or you do not have permission to view it', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if voting has ended - if so, include results
        const { ELECTION_PHASES, ELECTION_STATUS } = require('../../utils/constants')
        const now = new Date()
        const votingEnded = now > election.endDateTime ||
            election.currentPhase === ELECTION_PHASES.RESULTS ||
            election.currentPhase === ELECTION_PHASES.COMPLETED ||
            election.status === ELECTION_STATUS.COMPLETED ||
            !election.canVote()

        let results = null
        if (votingEnded) {
            try {
                const Position = require('../../models/Position')
                const Vote = require('../../models/Vote')
                const Candidate = require('../../models/Candidate')

                // Get all positions for this election
                const positions = await Position.find({ electionId: election._id })

                // Calculate results for each position
                const positionResults = await Promise.all(
                    positions.map(async (position) => {
                        // Get all votes for this position
                        const votes = await Vote.find({
                            electionId: election._id,
                            positionId: position._id,
                            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
                        })

                        // Get all candidates for this position
                        const candidates = await Candidate.find({
                            electionId: election._id,
                            positionId: position._id,
                            status: 'APPROVED'
                        })

                        // Count votes per candidate
                        const candidateVoteCounts = {}
                        let totalVotes = 0
                        let abstentionCount = 0

                        votes.forEach(vote => {
                            if (vote.isAbstention) {
                                abstentionCount++
                            } else if (vote.candidateId) {
                                const candidateId = vote.candidateId.toString()
                                candidateVoteCounts[candidateId] = (candidateVoteCounts[candidateId] || 0) + 1
                                totalVotes++
                            }
                        })

                        // Build results array with candidate details
                        const candidateResults = candidates.map(candidate => {
                            const voteCount = candidateVoteCounts[candidate._id.toString()] || 0
                            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0

                            return {
                                candidateId: candidate._id,
                                candidateName: candidate.fullName,
                                displayName: candidate.displayName,
                                voteCount,
                                percentage: parseFloat(percentage)
                            }
                        })

                        // Sort by vote count (descending)
                        candidateResults.sort((a, b) => b.voteCount - a.voteCount)

                        // Determine winner(s)
                        const maxVotes = candidateResults.length > 0 ? candidateResults[0].voteCount : 0
                        const winners = candidateResults.filter(c => c.voteCount === maxVotes && c.voteCount > 0)

                        return {
                            positionId: position._id,
                            positionTitle: position.title,
                            totalVotes,
                            abstentionCount,
                            candidates: candidateResults,
                            winners: winners.map(w => ({
                                candidateId: w.candidateId,
                                candidateName: w.candidateName,
                                voteCount: w.voteCount,
                                percentage: w.percentage
                            })),
                            isTie: winners.length > 1 && maxVotes > 0
                        }
                    })
                )

                results = {
                    electionId: election._id,
                    electionTitle: election.title,
                    totalPositions: positions.length,
                    positions: positionResults,
                    calculatedAt: new Date()
                }
            } catch (error) {
                logger.error({
                    type: 'get_election_results_error',
                    error: error.message,
                    electionId: election._id
                }, 'Failed to calculate results for election')
                // Don't fail the request if results calculation fails
                results = null
            }
        }

        // Convert election to object and add results
        const electionData = election.toObject()
        electionData.canVote = election.canVote()
        electionData.votingEnded = votingEnded
        if (results) {
            electionData.results = results
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(electionData, 'Election retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_election_error',
            error: error.message
        }, 'Failed to retrieve election')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update election (only by creator)
 */
const updateElection = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const election = await Election.findOne({
            _id: electionId,
            createdBy: userId
        })

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found or you do not have permission to update it', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Prevent updates if election is active or completed
        if (['ACTIVE', 'COMPLETED'].includes(election.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot update active or completed elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const updateData = req.body
        if (updateData.startDateTime) updateData.startDateTime = new Date(updateData.startDateTime)
        if (updateData.endDateTime) updateData.endDateTime = new Date(updateData.endDateTime)
        if (updateData.registrationDeadline) updateData.registrationDeadline = new Date(updateData.registrationDeadline)
        if (updateData.candidateNominationDeadline) updateData.candidateNominationDeadline = new Date(updateData.candidateNominationDeadline)
        if (updateData.campaignPeriod) {
            updateData.campaignPeriod = {
                startDate: new Date(updateData.campaignPeriod.startDate),
                endDate: new Date(updateData.campaignPeriod.endDate)
            }
        }

        Object.assign(election, updateData)
        await election.save()

        logger.info({
            type: 'election_updated',
            electionId: election._id,
            userId
        }, 'Election updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Election updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'election_update_error',
            error: error.message
        }, 'Failed to update election')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Advance election phase manually
 */
const advancePhase = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params
        const { phase } = req.body

        const electionWorkflowService = require('../../services/electionWorkflowService')
        const election = await electionWorkflowService.advancePhase(electionId, phase, userId)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Election phase advanced successfully')
        )
    } catch (error) {
        logger.error({
            type: 'advance_phase_error',
            error: error.message
        }, 'Failed to advance election phase')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to advance phase', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Start voting period
 */
const startVoting = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        const electionWorkflowService = require('../../services/electionWorkflowService')
        const election = await electionWorkflowService.startVoting(electionId, userId)

        // Emit phase change via Socket.io
        if (req.app.get('io')) {
            try {
                const SocketHandlers = require('../../socket/socketHandlers')
                const socketHandlers = new SocketHandlers(req.app.get('io'))
                socketHandlers.emitPhaseChange(electionId, 'VOTING')
            } catch (error) {
                logger.error({
                    type: 'socket_emit_error',
                    error: error.message
                }, 'Failed to emit phase change')
            }
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Voting period started successfully')
        )
    } catch (error) {
        logger.error({
            type: 'start_voting_error',
            error: error.message
        }, 'Failed to start voting')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to start voting', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Close voting period
 */
const closeVoting = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        const electionWorkflowService = require('../../services/electionWorkflowService')
        const election = await electionWorkflowService.closeVoting(electionId, userId)

        // Emit phase change via Socket.io
        if (req.app.get('io')) {
            try {
                const SocketHandlers = require('../../socket/socketHandlers')
                const socketHandlers = new SocketHandlers(req.app.get('io'))
                socketHandlers.emitPhaseChange(electionId, 'RESULTS')
            } catch (error) {
                logger.error({
                    type: 'socket_emit_error',
                    error: error.message
                }, 'Failed to emit phase change')
            }
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Voting period closed successfully')
        )
    } catch (error) {
        logger.error({
            type: 'close_voting_error',
            error: error.message
        }, 'Failed to close voting')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to close voting', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Complete election
 */
const completeElection = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        const electionWorkflowService = require('../../services/electionWorkflowService')
        const election = await electionWorkflowService.completeElection(electionId, userId)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Election completed successfully')
        )
    } catch (error) {
        logger.error({
            type: 'complete_election_error',
            error: error.message
        }, 'Failed to complete election')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to complete election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Send provisional results to candidates
 */
const sendProvisionalResults = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        const electionWorkflowService = require('../../services/electionWorkflowService')
        const result = await electionWorkflowService.sendProvisionalResults(electionId)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(result, 'Provisional results sent to candidates successfully')
        )
    } catch (error) {
        logger.error({
            type: 'send_provisional_results_error',
            error: error.message
        }, 'Failed to send provisional results')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to send provisional results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Advanced search for elections
 * GET /api/elections/search
 */
const searchElections = async (req, res) => {
    try {
        const searchUtils = require('../../utils/searchUtils')
        const {
            search,
            status,
            type,
            scope,
            schoolId,
            associationId,
            startDate,
            endDate,
            page = 1,
            limit = 20,
            sort = '-createdAt'
        } = req.query

        const filters = {}
        if (status) filters.status = status
        if (type) filters.type = type
        if (scope) filters.scope = scope
        if (schoolId) filters.schoolId = schoolId
        if (associationId) filters.associationId = associationId

        const dateRange = {}
        if (startDate || endDate) {
            dateRange.startDateTime = {
                from: startDate,
                to: endDate
            }
        }

        const searchParams = {
            search,
            filters,
            dateRange,
            sort: searchUtils.buildSort(sort)
        }

        const query = searchUtils.buildSearchQuery(Election, searchParams)

        // Add user filter if not admin
        if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
            query.createdBy = req.user.id
        }

        const pagination = searchUtils.buildPagination(page, limit)

        const [elections, total] = await Promise.all([
            Election.find(query)
                .populate('schoolId', 'name shortName code')
                .populate('associationId', 'name shortName code')
                .populate('createdBy', 'firstname lastname email')
                .sort(searchParams.sort)
                .skip(pagination.skip)
                .limit(pagination.limit),
            Election.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(
                searchUtils.formatSearchResults(elections, total, pagination),
                'Elections retrieved successfully'
            )
        )
    } catch (error) {
        logger.error({
            type: 'election_search_error',
            error: error.message
        }, 'Failed to search elections')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to search elections', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    createElection,
    getMyElections,
    getElection,
    updateElection,
    advancePhase,
    startVoting,
    closeVoting,
    completeElection,
    sendProvisionalResults,
    searchElections
}

