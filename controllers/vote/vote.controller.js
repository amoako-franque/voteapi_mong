const mongoose = require('mongoose')
const crypto = require('crypto')
const Vote = require('../../models/Vote')
const Election = require('../../models/Election')
const Position = require('../../models/Position')
const Candidate = require('../../models/Candidate')
const VoterRegistry = require('../../models/VoterRegistry')
const VoterSecretCode = require('../../models/VoterSecretCode')
const VoterElectionAccess = require('../../models/VoterElectionAccess')
const secretCodeService = require('../../services/secretCodeService')
const notificationService = require('../../services/notificationService')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Validate secret code before voting
 * POST /api/votes/validate
 */
const validateSecretCode = async (req, res) => {
    try {
        const { voterId, electionId, positionId, secretCode } = req.body
        const ipAddress = req.ip || req.connection.remoteAddress
        const userAgent = req.headers['user-agent']

        // Find voter
        const voter = await VoterRegistry.findById(voterId)
        if (!voter) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Voter not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Find election
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if election is active
        if (!election.canVote()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election is not currently accepting votes', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Find position
        const position = await Position.findById(positionId)
        if (!position) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Position not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if position belongs to election
        if (position.electionId?.toString() !== electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Position does not belong to this election', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Validate secret code
        try {
            const validationResult = await secretCodeService.validateSecretCode(
                voterId,
                electionId,
                positionId,
                secretCode,
                ipAddress,
                userAgent
            )

            // Check voter election access
            const voterAccess = await VoterElectionAccess.findByVoterAndElection(voterId, electionId)
            if (!voterAccess || !voterAccess.isActive || voterAccess.status !== 'ACTIVE') {
                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('Voter does not have access to this election', HTTP_STATUS.FORBIDDEN)
                )
            }

            // Check if voter can vote for this position
            if (!voterAccess.canVoteForPosition(positionId)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Voter has already voted for this position or is not eligible', HTTP_STATUS.BAD_REQUEST)
                )
            }

            // Generate session token for voting
            const sessionToken = crypto.randomBytes(32).toString('hex')
            const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

            logger.info({
                type: 'secret_code_validated',
                voterId,
                electionId,
                positionId,
                ipAddress
            }, 'Secret code validated successfully')

            return res.status(HTTP_STATUS.OK).json(
                responseFormatter.success({
                    isValid: true,
                    sessionToken,
                    sessionExpiresAt,
                    voterAccess: {
                        totalEligiblePositions: voterAccess.totalEligiblePositions,
                        totalVotesCast: voterAccess.totalVotesCast,
                        votingProgress: voterAccess.votingProgress
                    }
                }, 'Secret code validated successfully')
            )
        } catch (error) {
            logger.error({
                type: 'secret_code_validation_error',
                error: error.message,
                voterId,
                electionId,
                positionId,
                ipAddress
            }, 'Secret code validation failed')

            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error(error.message || 'Invalid secret code', HTTP_STATUS.BAD_REQUEST)
            )
        }
    } catch (error) {
        logger.error({
            type: 'validate_secret_code_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to validate secret code')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to validate secret code', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Submit a vote
 * POST /api/votes
 */
const submitVote = async (req, res) => {
    try {
        const {
            electionId,
            positionId,
            candidateId,
            voterId,
            secretCode,
            voterIdNumber,
            isAbstention = false,
            abstentionReason,
            voteType = 'FIRST_CHOICE',
            deviceFingerprint,
            clientInfo
        } = req.body

        const ipAddress = req.ip || req.connection.remoteAddress
        const userAgent = req.headers['user-agent']

        // Find and validate election
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if election is active
        if (!election.canVote()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election is not currently accepting votes', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Find and validate position
        const position = await Position.findById(positionId)
        if (!position) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Position not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if position belongs to election
        if (position.electionId?.toString() !== electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Position does not belong to this election', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Find and validate candidate (if not abstaining)
        let candidate = null
        if (!isAbstention) {
            candidate = await Candidate.findById(candidateId)
            if (!candidate) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('Candidate not found', HTTP_STATUS.NOT_FOUND)
                )
            }

            // Check if candidate belongs to position
            if (candidate.positionId?.toString() !== positionId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Candidate does not belong to this position', HTTP_STATUS.BAD_REQUEST)
                )
            }

            // Check if candidate is approved
            if (candidate.status !== 'APPROVED') {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Candidate is not approved for this election', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Find and validate voter
        const voter = await VoterRegistry.findById(voterId)
        if (!voter) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Voter not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Validate secret code
        try {
            await secretCodeService.validateSecretCode(
                voterId,
                electionId,
                positionId,
                secretCode,
                ipAddress,
                userAgent
            )
        } catch (error) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error(error.message || 'Invalid secret code', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check voter election access
        const voterAccess = await VoterElectionAccess.findByVoterAndElection(voterId, electionId)
        if (!voterAccess || !voterAccess.isActive || voterAccess.status !== 'ACTIVE') {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Voter does not have access to this election', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Check if voter has already voted for this position
        if (voterAccess.hasVotedForPosition(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voter has already voted for this position', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check if voter can vote for this position
        if (!voterAccess.canVoteForPosition(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voter is not eligible to vote for this position', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get secret code record
        const secretCodeRecord = await VoterSecretCode.findByVoterAndElection(voterId, electionId)
        if (!secretCodeRecord) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Secret code not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check for duplicate vote (compound unique index will prevent this, but check first)
        const existingVote = await Vote.findOne({
            electionId,
            voterId,
            positionId
        })

        if (existingVote) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Vote already exists for this position', HTTP_STATUS.CONFLICT)
            )
        }

        // Generate session token
        const sessionToken = crypto.randomBytes(32).toString('hex')
        const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

        // Generate receipt hash
        const receiptHash = crypto
            .createHash('sha256')
            .update(`${ electionId }-${ voterId }-${ positionId }-${ Date.now() }-${ sessionToken }`)
            .digest('hex')
            .substring(0, 32)
            .toUpperCase()

        // Create vote
        const vote = await Vote.create({
            electionId,
            positionId,
            candidateId: isAbstention ? null : candidateId,
            voterId,
            secretCodeId: secretCodeRecord._id,
            voterElectionAccessId: voterAccess._id,
            sessionToken,
            voterIdNumber: voterIdNumber || voter.voterId,
            clientInfo: clientInfo || {},
            deviceFingerprint: deviceFingerprint || secretCodeService.generateDeviceFingerprint(ipAddress, userAgent),
            ipAddress,
            userAgent,
            sessionExpiresAt,
            isAbstention,
            abstentionReason,
            voteType,
            receiptHash,
            status: 'CAST',
            verified: false,
            processingStatus: 'PENDING',
            timezone: election.timezone || 'Africa/Accra',
            metadata: {
                electionPhase: election.currentPhase,
                securityLevel: 'STANDARD'
            },
            auditTrail: [{
                action: 'VOTE_CAST',
                timestamp: new Date(),
                details: {
                    ipAddress,
                    userAgent,
                    voteType,
                    isAbstention
                }
            }]
        })

        // Record successful vote with secret code
        await secretCodeService.recordVoteWithCode(
            secretCodeRecord._id,
            positionId,
            isAbstention ? null : candidateId,
            voterId
        )

        // Update voter election access
        await voterAccess.recordVote(positionId, isAbstention ? null : candidateId, vote._id)

        // Auto-verify vote if election settings allow
        if (election.securitySettings?.requireVoterVerification === false) {
            await vote.verifyVote(null, 'AUTOMATIC')
        }

        // Send vote confirmation email (async, don't block response)
        notificationService.sendVoteConfirmation(voter, vote, election, position, candidate || null)
            .catch(error => {
                logger.error({
                    type: 'vote_confirmation_email_error',
                    error: error.message,
                    voteId: vote._id,
                    voterId
                }, 'Failed to send vote confirmation email')
            })

        logger.info({
            type: 'vote_submitted',
            voteId: vote._id,
            electionId,
            positionId,
            candidateId: isAbstention ? null : candidateId,
            voterId,
            isAbstention,
            receiptHash: vote.receiptHash
        }, 'Vote submitted successfully')

        // Emit real-time vote update via Socket.io (if available)
        if (req.app.get('io')) {
            try {
                const SocketHandlers = require('../../socket/socketHandlers')
                const socketHandlers = new SocketHandlers(req.app.get('io'))
                socketHandlers.emitVoteCast({
                    electionId: electionId.toString(),
                    positionId: positionId.toString(),
                    candidateId: isAbstention ? null : candidateId?.toString(),
                    voteId: vote._id.toString(),
                    timestamp: vote.timestamp
                })
            } catch (error) {
                logger.error({
                    type: 'socket_emit_error',
                    error: error.message,
                    voteId: vote._id
                }, 'Failed to emit vote cast event')
            }
        }

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success({
                vote: vote.getVoteSummary(),
                receipt: {
                    receiptHash: vote.receiptHash,
                    receiptNumber: `VOTE-${ vote._id.toString().substring(0, 8).toUpperCase() }`,
                    timestamp: vote.timestamp,
                    electionTitle: election.title,
                    positionTitle: position.title,
                    candidateName: candidate ? candidate.fullName : 'Abstention',
                    isAbstention: vote.isAbstention
                },
                sessionToken: vote.sessionToken,
                sessionExpiresAt: vote.sessionExpiresAt
            }, 'Vote submitted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'submit_vote_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to submit vote')

        // Handle duplicate vote error
        if (error.code === 11000) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Vote already exists for this position', HTTP_STATUS.CONFLICT)
            )
        }

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to submit vote', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get votes (Admin only)
 * GET /api/votes
 */
const getVotes = async (req, res) => {
    try {
        const {
            electionId,
            positionId,
            voterId,
            status,
            verified,
            page = 1,
            limit = 50
        } = req.query

        const query = {}

        if (electionId) query.electionId = electionId
        if (positionId) query.positionId = positionId
        if (voterId) query.voterId = voterId
        if (status) query.status = status
        if (verified !== undefined) query.verified = verified === 'true'

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [votes, total] = await Promise.all([
            Vote.find(query)
                .populate('electionId', 'title scope')
                .populate('positionId', 'title')
                .populate('candidateId', 'fullName displayName')
                .populate('voterId', 'fullName email voterId')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Vote.countDocuments(query)
        ])

        logger.info({
            type: 'votes_retrieved',
            count: votes.length,
            total,
            query
        }, 'Votes retrieved successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                votes: votes.map(vote => vote.getVoteSummary()),
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Votes retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_votes_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get votes')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get votes', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get vote by ID
 * GET /api/votes/:id
 */
const getVoteById = async (req, res) => {
    try {
        const { id } = req.params

        const vote = await Vote.findById(id)
            .populate('electionId', 'title scope')
            .populate('positionId', 'title')
            .populate('candidateId', 'fullName displayName')
            .populate('voterId', 'fullName email voterId')
            .populate('secretCodeId', 'codeHash')
            .populate('voterElectionAccessId', 'status')

        if (!vote) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Vote not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(vote.getVoteSummary(), 'Vote retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_vote_by_id_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get vote by ID')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get vote', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify a vote (Admin only)
 * POST /api/votes/:id/verify
 */
const verifyVote = async (req, res) => {
    try {
        const { id } = req.params
        const { verificationMethod = 'MANUAL' } = req.body
        const userId = req.user?.id

        const vote = await Vote.findById(id)
        if (!vote) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Vote not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (vote.verified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Vote is already verified', HTTP_STATUS.BAD_REQUEST)
            )
        }

        await vote.verifyVote(userId, verificationMethod)

        logger.info({
            type: 'vote_verified',
            voteId: vote._id,
            verifiedBy: userId,
            verificationMethod
        }, 'Vote verified successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(vote.getVoteSummary(), 'Vote verified successfully')
        )
    } catch (error) {
        logger.error({
            type: 'verify_vote_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to verify vote')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify vote', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    validateSecretCode,
    submitVote,
    getVotes,
    getVoteById,
    verifyVote
}

