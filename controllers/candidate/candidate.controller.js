const mongoose = require('mongoose')
const Candidate = require('../../models/Candidate')
const VoterRegistry = require('../../models/VoterRegistry')
const Position = require('../../models/Position')
const Election = require('../../models/Election')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const imageUploadService = require('../../services/imageUploadService')

/**
 * Add a candidate to a position
 * - Candidate must be a valid voter
 * - Candidate cannot stand for more than one position in the same election
 */
const addCandidate = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId, positionId } = req.params

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid positionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const {
            voterId, // VoterRegistry ID or email
            fullName,
            displayName,
            manifesto,
            campaignSlogan,
            shortBio,
            profileImage,
            policyHighlights,
            policies,
            contactInfo
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
                responseFormatter.error('Only the election creator can add candidates', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Verify position exists and belongs to this election
        const position = await Position.findById(positionId)
        if (!position) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Position not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        if (position.electionId.toString() !== electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Position does not belong to this election', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check if position can accept more candidates
        if (!position.canAcceptMoreCandidates()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Position has reached maximum number of candidates', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Find voter - can be by ID or email
        let voter
        if (voterId) {
            voter = await VoterRegistry.findById(voterId)
        } else if (req.body.email) {
            voter = await VoterRegistry.findOne({ email: req.body.email.toLowerCase() })
        } else {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voter ID or email is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!voter) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Voter not found in registry', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Validate that voter is eligible for this election
        if (!voter.isEligibleForElection(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voter is not eligible for this election', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check if candidate is already running for another position in this election
        const existingCandidate = await Candidate.findOne({
            electionId,
            voterId: voter._id,
            status: { $in: ['PENDING', 'APPROVED'] }
        })

        if (existingCandidate) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Candidate cannot stand for more than one position in the same election', HTTP_STATUS.CONFLICT)
            )
        }

        // Check if candidate is already running for this specific position
        const existingPositionCandidate = await Candidate.findOne({
            positionId,
            voterId: voter._id
        })

        if (existingPositionCandidate) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Candidate is already running for this position', HTTP_STATUS.CONFLICT)
            )
        }

        // Check position eligibility criteria if any
        if (position.eligibilityCriteria && Object.keys(position.eligibilityCriteria).length > 0) {
            const voterData = {
                age: voter.age,
                yearOfStudy: voter.yearOfStudy,
                department: voter.departmentName,
                associationId: voter.associationId,
                gpa: voter.academicInfo?.gpa
            }

            if (!position.isEligibleCandidate(voterData)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Voter does not meet the eligibility criteria for this position', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Handle profile image upload if provided
        let profileImageData = null
        if (req.file) {
            try {
                profileImageData = await imageUploadService.uploadCandidateProfileImage(req.file.path)
                // Clean up original uploaded file
                try {
                    const fs = require('fs').promises
                    await fs.unlink(req.file.path)
                } catch (error) {
                    logger.warn({
                        type: 'temp_file_cleanup_warning',
                        error: error.message,
                        path: req.file.path
                    }, 'Failed to cleanup temporary file')
                }
            } catch (error) {
                logger.error({
                    type: 'candidate_image_upload_error',
                    error: error.message
                }, 'Failed to upload candidate profile image')
                // Continue without image if upload fails
            }
        } else if (profileImage) {
            // If profileImage is provided as URL string (legacy support)
            profileImageData = {
                url: profileImage,
                storageType: 'LOCAL',
                uniqueId: profileImage
            }
        }

        // Create candidate
        const candidate = await Candidate.create({
            voterId: voter._id,
            positionId,
            electionId,
            fullName: fullName || voter.fullName,
            displayName: displayName || voter.fullName,
            manifesto,
            campaignSlogan,
            shortBio,
            profileImage: profileImageData,
            policyHighlights,
            policies: policies || {},
            contactInfo: contactInfo || {
                email: voter.email,
                phone: voter.phone
            },
            status: 'APPROVED', // Auto-approve if added by election creator
            nominationStatus: 'NOMINATED_BY_OTHERS',
            createdBy: userId
        })

        // Update position statistics
        await Position.findByIdAndUpdate(positionId, {
            $inc: { 'statistics.totalCandidates': 1 }
        })

        // Update election statistics
        await Election.findByIdAndUpdate(electionId, {
            $inc: { 'statistics.totalCandidates': 1 }
        })

        logger.info({
            type: 'candidate_added',
            candidateId: candidate._id,
            electionId,
            positionId,
            voterId: voter._id,
            userId
        }, 'Candidate added successfully')

        // Populate voter and position details
        await candidate.populate('voterId', 'firstName lastName email')
        await candidate.populate('positionId', 'title description')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(candidate, 'Candidate added successfully')
        )
    } catch (error) {
        logger.error({
            type: 'candidate_add_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to add candidate')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to add candidate', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get candidates for a position
 */
const getPositionCandidates = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId, positionId } = req.params

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!mongoose.Types.ObjectId.isValid(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid positionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
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
                responseFormatter.error('Only the election creator can view candidates', HTTP_STATUS.FORBIDDEN)
            )
        }

        const candidates = await Candidate.findByPosition(positionId)
            .populate('voterId', 'firstName lastName email phone studentNumber')
            .populate('positionId', 'title description')
            .sort({ createdAt: -1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(candidates, 'Candidates retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_candidates_error',
            error: error.message
        }, 'Failed to retrieve candidates')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all candidates for an election
 */
const getElectionCandidates = async (req, res) => {
    try {
        const userId = req.user.id
        const { electionId } = req.params
        const { status, positionId } = req.query

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (positionId && !mongoose.Types.ObjectId.isValid(positionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid positionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
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
                responseFormatter.error('Only the election creator can view candidates', HTTP_STATUS.FORBIDDEN)
            )
        }

        const query = { electionId }
        if (status) query.status = status
        if (positionId) query.positionId = positionId

        const candidates = await Candidate.find(query)
            .populate('voterId', 'firstName lastName email phone studentNumber')
            .populate('positionId', 'title description')
            .sort({ createdAt: -1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(candidates, 'Candidates retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_election_candidates_error',
            error: error.message
        }, 'Failed to retrieve candidates')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Remove a candidate (only by election creator)
 */
const removeCandidate = async (req, res) => {
    try {
        const userId = req.user.id
        const { candidateId } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(candidateId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid candidateId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const candidate = await Candidate.findById(candidateId)
            .populate('electionId')

        if (!candidate) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Candidate not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify user is election creator
        if (candidate.electionId.createdBy.toString() !== userId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the election creator can remove candidates', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Prevent removal if election is active or completed
        if (['ACTIVE', 'COMPLETED'].includes(candidate.electionId.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot remove candidates from active or completed elections', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const positionId = candidate.positionId
        const electionId = candidate.electionId._id

        // Delete profile image if exists
        if (candidate.profileImage && candidate.profileImage.url) {
            try {
                await imageUploadService.deleteCandidateProfileImage(candidate.profileImage)
            } catch (error) {
                logger.warn({
                    type: 'candidate_image_delete_warning',
                    error: error.message,
                    candidateId
                }, 'Failed to delete candidate profile image during removal')
            }
        }

        await Candidate.findByIdAndDelete(candidateId)

        // Update statistics
        await Position.findByIdAndUpdate(positionId, {
            $inc: { 'statistics.totalCandidates': -1 }
        })

        await Election.findByIdAndUpdate(electionId, {
            $inc: { 'statistics.totalCandidates': -1 }
        })

        logger.info({
            type: 'candidate_removed',
            candidateId,
            userId
        }, 'Candidate removed successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Candidate removed successfully')
        )
    } catch (error) {
        logger.error({
            type: 'candidate_remove_error',
            error: error.message
        }, 'Failed to remove candidate')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to remove candidate', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update candidate profile image
 * PUT /api/candidates/:candidateId/profile-image
 */
const updateCandidateProfileImage = async (req, res) => {
    try {
        const userId = req.user.id
        const { candidateId } = req.params

        if (!mongoose.Types.ObjectId.isValid(candidateId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid candidateId format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('No image file provided', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const candidate = await Candidate.findById(candidateId)
            .populate('electionId')

        if (!candidate) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Candidate not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify user has permission (election creator or candidate themselves)
        const isElectionCreator = candidate.electionId.createdBy.toString() === userId.toString()
        const isCandidate = candidate.voterId && candidate.voterId.toString() === userId.toString()

        if (!isElectionCreator && !isCandidate) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('You do not have permission to update this candidate', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Delete old image if exists
        if (candidate.profileImage && candidate.profileImage.url) {
            try {
                await imageUploadService.deleteCandidateProfileImage(candidate.profileImage)
            } catch (error) {
                logger.warn({
                    type: 'old_image_delete_warning',
                    error: error.message,
                    candidateId
                }, 'Failed to delete old profile image, continuing with upload')
            }
        }

        // Upload new image
        const profileImageData = await imageUploadService.uploadCandidateProfileImage(req.file.path)

        // Clean up temporary file
        try {
            const fs = require('fs').promises
            await fs.unlink(req.file.path)
        } catch (error) {
            logger.warn({
                type: 'temp_file_cleanup_warning',
                error: error.message
            }, 'Failed to cleanup temporary file')
        }

        // Update candidate
        candidate.profileImage = profileImageData
        candidate.updatedBy = userId
        await candidate.save()

        logger.info({
            type: 'candidate_profile_image_updated',
            candidateId,
            userId,
            storageType: profileImageData.storageType
        }, 'Candidate profile image updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(candidate, 'Profile image updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_candidate_profile_image_error',
            error: error.message,
            candidateId: req.params.candidateId
        }, 'Failed to update candidate profile image')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update profile image', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete candidate profile image
 * DELETE /api/candidates/:candidateId/profile-image
 */
const deleteCandidateProfileImage = async (req, res) => {
    try {
        const userId = req.user.id
        const { candidateId } = req.params

        if (!mongoose.Types.ObjectId.isValid(candidateId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid candidateId format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const candidate = await Candidate.findById(candidateId)
            .populate('electionId')

        if (!candidate) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Candidate not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify user has permission
        const isElectionCreator = candidate.electionId.createdBy.toString() === userId.toString()
        const isCandidate = candidate.voterId && candidate.voterId.toString() === userId.toString()

        if (!isElectionCreator && !isCandidate) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('You do not have permission to delete this candidate image', HTTP_STATUS.FORBIDDEN)
            )
        }

        if (!candidate.profileImage || !candidate.profileImage.url) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Candidate has no profile image', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Delete image from storage
        await imageUploadService.deleteCandidateProfileImage(candidate.profileImage)

        // Remove image data from candidate
        candidate.profileImage = undefined
        candidate.updatedBy = userId
        await candidate.save()

        logger.info({
            type: 'candidate_profile_image_deleted',
            candidateId,
            userId
        }, 'Candidate profile image deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Profile image deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'delete_candidate_profile_image_error',
            error: error.message,
            candidateId: req.params.candidateId
        }, 'Failed to delete candidate profile image')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete profile image', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    addCandidate,
    getPositionCandidates,
    getElectionCandidates,
    removeCandidate,
    updateCandidateProfileImage,
    deleteCandidateProfileImage
}

