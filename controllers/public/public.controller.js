const mongoose = require('mongoose')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const Election = require('../../models/Election')
const Candidate = require('../../models/Candidate')
const Position = require('../../models/Position')
const ElectionResult = require('../../models/ElectionResult')
const { ELECTION_STATUS, ELECTION_PHASES } = require('../../utils/constants')

/**
 * Get public elections
 * GET /api/public/elections
 */
const getPublicElections = async (req, res) => {
    try {
        const { page = 1, limit = 20, scope, status } = req.query

        const query = {
            // Only show active or completed elections
            status: { $in: [ELECTION_STATUS.ACTIVE, ELECTION_STATUS.COMPLETED] }
        }

        if (scope) {
            query.scope = scope
        }

        if (status) {
            query.status = status
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [elections, total] = await Promise.all([
            Election.find(query)
                .select('title description scope status currentPhase startDateTime endDateTime createdAt')
                .populate('schoolId', 'name shortName code')
                .populate('associationId', 'name shortName code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Election.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                elections,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Public elections retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_public_elections_error',
            error: error.message
        }, 'Failed to get public elections')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve public elections', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get public election details
 * GET /api/public/elections/:id
 */
const getPublicElection = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const election = await Election.findOne({
            _id: id,
            status: { $in: [ELECTION_STATUS.ACTIVE, ELECTION_STATUS.COMPLETED] }
        })
            .select('title description scope status currentPhase startDateTime endDateTime createdAt')
            .populate('schoolId', 'name shortName code')
            .populate('associationId', 'name shortName code')

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found or not publicly available', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(election, 'Public election retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_public_election_error',
            error: error.message,
            electionId: req.params.id
        }, 'Failed to get public election')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve public election', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get public candidates for an election
 * GET /api/public/elections/:id/candidates
 */
const getPublicCandidates = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify election is public
        const election = await Election.findOne({
            _id: id,
            status: { $in: [ELECTION_STATUS.ACTIVE, ELECTION_STATUS.COMPLETED] }
        })

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found or not publicly available', HTTP_STATUS.NOT_FOUND)
            )
        }

        const candidates = await Candidate.find({
            electionId: id,
            status: 'APPROVED'
        })
            .select('fullName displayName positionId createdAt')
            .populate('positionId', 'title description')
            .sort({ createdAt: -1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(candidates, 'Public candidates retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_public_candidates_error',
            error: error.message,
            electionId: req.params.id
        }, 'Failed to get public candidates')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve public candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get public positions for an election
 * GET /api/public/elections/:id/positions
 */
const getPublicPositions = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify election is public
        const election = await Election.findOne({
            _id: id,
            status: { $in: [ELECTION_STATUS.ACTIVE, ELECTION_STATUS.COMPLETED] }
        })

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found or not publicly available', HTTP_STATUS.NOT_FOUND)
            )
        }

        const positions = await Position.find({ electionId: id })
            .select('title description maxWinners createdAt')
            .sort({ createdAt: -1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(positions, 'Public positions retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_public_positions_error',
            error: error.message,
            electionId: req.params.id
        }, 'Failed to get public positions')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve public positions', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get public results for an election (if voting has ended)
 * GET /api/public/results/:electionId
 */
const getPublicResults = async (req, res) => {
    try {
        const { electionId } = req.params

        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const election = await Election.findById(electionId)

        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if voting has ended
        const now = new Date()
        const votingEnded = now > election.endDateTime ||
                           election.currentPhase === ELECTION_PHASES.RESULTS ||
                           election.currentPhase === ELECTION_PHASES.COMPLETED ||
                           election.status === ELECTION_STATUS.COMPLETED

        if (!votingEnded) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Results are not available until voting ends', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Get results
        const result = await ElectionResult.getFinalResult(electionId) ||
                      await ElectionResult.getElectionResult(electionId)

        if (!result) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Results not yet calculated for this election', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Return only public information
        const publicResult = {
            electionId: result.electionId,
            electionTitle: result.electionTitle,
            calculatedAt: result.calculatedAt,
            status: result.status,
            totalPositions: result.totalPositions,
            totalVotes: result.totalVotes,
            totalVoters: result.totalVoters,
            turnoutPercentage: result.turnoutPercentage,
            positions: result.positions.map(position => ({
                positionId: position.positionId,
                positionTitle: position.positionTitle,
                totalVotes: position.totalVotes,
                candidates: position.candidates.map(candidate => ({
                    candidateName: candidate.candidateName,
                    displayName: candidate.displayName,
                    voteCount: candidate.voteCount,
                    percentage: candidate.percentage,
                    rank: candidate.rank
                })),
                winners: position.winners.map(winner => ({
                    candidateName: winner.candidateName,
                    voteCount: winner.voteCount,
                    percentage: winner.percentage
                })),
                isTie: position.isTie
            }))
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(publicResult, 'Public results retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_public_results_error',
            error: error.message,
            electionId: req.params.electionId
        }, 'Failed to get public results')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve public results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getPublicElections,
    getPublicElection,
    getPublicCandidates,
    getPublicPositions,
    getPublicResults
}

