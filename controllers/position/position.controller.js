const mongoose = require('mongoose')
const Position = require('../../models/Position')
const Election = require('../../models/Election')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Create a position for an election
 * - Only election creator can create positions
 */
const createPosition = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const {
            title,
            description,
            shortDescription,
            orderIndex,
            category,
            level,
            scope,
            maxCandidates,
            minCandidates,
            maxWinners,
            eligibilityCriteria,
            votingMethod,
            allowAbstention,
            allowWriteIn,
            termLength,

        } = req.body

        // Verify election exists and user is the creator
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (election.createdBy.toString() !== userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the election creator can create positions for this election', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Prevent creating positions if election is active or completed
        if (['ACTIVE', 'COMPLETED'].includes(election.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot create positions for active or completed elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get the next order index if not provided
        let finalOrderIndex = orderIndex
        if (!finalOrderIndex) {
            const lastPosition = await Position.findOne({ electionId })
                .sort({ orderIndex: -1 })
            finalOrderIndex = lastPosition ? lastPosition.orderIndex + 1 : 1
        }

        // Create position
        const position = await Position.create({
            title,
            description,
            shortDescription,
            orderIndex: finalOrderIndex,
            category: category || 'REPRESENTATIVE',
            level: level || 'REPRESENTATIVE',
            scope: scope || election.scope,
            maxCandidates: maxCandidates || 10,
            minCandidates: minCandidates || 1,
            maxWinners: maxWinners || 1,
            eligibilityCriteria: eligibilityCriteria || {},
            votingMethod: votingMethod || 'SINGLE_VOTE',
            allowAbstention: allowAbstention !== undefined ? allowAbstention : true,
            allowWriteIn: allowWriteIn || false,
            termLength: termLength || '1 year',
            electionId,
            createdBy: userId
        })

        // Update election statistics
        await Election.findByIdAndUpdate(electionId, {
            $inc: { 'statistics.totalPositions': 1 }
        })

        logger.info({
            type: 'position_created',
            positionId: position._id,
            electionId,
            userId
        }, 'Position created successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(position, 'Position created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'position_creation_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to create position')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create position', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all positions for an election
 */
const getElectionPositions = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify election exists and user is the creator
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (election.createdBy.toString() !== userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the election creator can view positions', HTTP_STATUS.FORBIDDEN)
            )
        }

        const positions = await Position.findByElection(electionId)
            .populate('createdBy', 'firstname lastname email')
            .sort({ orderIndex: 1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(positions, 'Positions retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_positions_error',
            error: error.message
        }, 'Failed to retrieve positions')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve positions', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update a position (only by election creator)
 */
const updatePosition = async (req, res) => {
    try {
        const userId = req.user.id
        const { positionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid positionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const position = await Position.findById(positionId)
            .populate('electionId')

        if (!position) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Position not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify user is election creator
        if (position.electionId.createdBy.toString() !== userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the election creator can update positions', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Prevent updates if election is active or completed
        if (['ACTIVE', 'COMPLETED'].includes(position.electionId.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot update positions for active or completed elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const updateData = req.body
        Object.assign(position, updateData)
        await position.save()

        logger.info({
            type: 'position_updated',
            positionId: position._id,
            userId
        }, 'Position updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(position, 'Position updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'position_update_error',
            error: error.message
        }, 'Failed to update position')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update position', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete a position (only by election creator)
 */
const deletePosition = async (req, res) => {
    try {
        const userId = req.user.id
        const { positionId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid positionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const position = await Position.findById(positionId)
            .populate('electionId')

        if (!position) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Position not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify user is election creator
        if (position.electionId.createdBy.toString() !== userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the election creator can delete positions', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Prevent deletion if election is active or completed
        if (['ACTIVE', 'COMPLETED'].includes(position.electionId.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot delete positions for active or completed elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        await Position.findByIdAndDelete(positionId)

        // Update election statistics
        await Election.findByIdAndUpdate(position.electionId._id, {
            $inc: { 'statistics.totalPositions': -1 }
        })

        logger.info({
            type: 'position_deleted',
            positionId,
            userId
        }, 'Position deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Position deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'position_delete_error',
            error: error.message
        }, 'Failed to delete position')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete position', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    createPosition,
    getElectionPositions,
    updatePosition,
    deletePosition
}

