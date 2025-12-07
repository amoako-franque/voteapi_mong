const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const VoterRegistry = require('../../models/VoterRegistry')
const Candidate = require('../../models/Candidate')
const Election = require('../../models/Election')
const User = require('../../models/User')
const papaparse = require('papaparse')

/**
 * Bulk register voters
 * POST /api/bulk/voters
 */
const bulkRegisterVoters = async (req, res) => {
    try {
        const { electionId, voters } = req.body

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!voters || !Array.isArray(voters) || voters.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voters array is required and must not be empty', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (voters.length > 1000) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Maximum 1000 voters can be registered at once', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify election exists
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const results = {
            total: voters.length,
            successful: 0,
            failed: 0,
            errors: []
        }

        // Process voters in batches
        const batchSize = 50
        for (let i = 0; i < voters.length; i += batchSize) {
            const batch = voters.slice(i, i + batchSize)

            await Promise.all(batch.map(async (voterData) => {
                try {
                    // Check if voter already exists
                    const existingVoter = await VoterRegistry.findOne({
                        electionId,
                        email: voterData.email
                    })

                    if (existingVoter) {
                        results.failed++
                        results.errors.push({
                            email: voterData.email,
                            error: 'Voter already registered'
                        })
                        return
                    }

                    // Create voter
                    const voter = new VoterRegistry({
                        ...voterData,
                        electionId,
                        verified: voterData.verified !== undefined ? voterData.verified : true,
                        eligible: voterData.eligible !== undefined ? voterData.eligible : true
                    })

                    await voter.save()
                    results.successful++
                } catch (error) {
                    results.failed++
                    results.errors.push({
                        email: voterData.email || 'unknown',
                        error: error.message
                    })
                }
            }))
        }

        logger.info({
            type: 'bulk_voter_registration',
            electionId,
            total: results.total,
            successful: results.successful,
            failed: results.failed
        }, `Bulk registered ${results.successful} of ${results.total} voters`)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(results, 'Bulk voter registration completed')
        )
    } catch (error) {
        logger.error({
            type: 'bulk_voter_registration_error',
            error: error.message
        }, 'Failed to bulk register voters')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to bulk register voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Bulk approve/reject candidates
 * POST /api/bulk/candidates
 */
const bulkUpdateCandidates = async (req, res) => {
    try {
        const { candidateIds, action, reason } = req.body

        if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Candidate IDs array is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!['APPROVE', 'REJECT', 'WITHDRAW'].includes(action)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Action must be APPROVE, REJECT, or WITHDRAW', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const results = {
            total: candidateIds.length,
            successful: 0,
            failed: 0,
            errors: []
        }

        const updateData = {
            status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'WITHDRAWN',
            reviewedBy: req.user._id,
            reviewedAt: new Date()
        }

        if (reason) {
            updateData.reviewNotes = reason
        }

        for (const candidateId of candidateIds) {
            try {
                const candidate = await Candidate.findById(candidateId)
                if (!candidate) {
                    results.failed++
                    results.errors.push({
                        candidateId,
                        error: 'Candidate not found'
                    })
                    continue
                }

                Object.assign(candidate, updateData)
                await candidate.save()
                results.successful++
            } catch (error) {
                results.failed++
                results.errors.push({
                    candidateId,
                    error: error.message
                })
            }
        }

        logger.info({
            type: 'bulk_candidate_update',
            action,
            total: results.total,
            successful: results.successful,
            failed: results.failed
        }, `Bulk ${action} ${results.successful} of ${results.total} candidates`)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(results, `Bulk ${action} completed`)
        )
    } catch (error) {
        logger.error({
            type: 'bulk_candidate_update_error',
            error: error.message
        }, 'Failed to bulk update candidates')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to bulk update candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Bulk update user status
 * POST /api/bulk/users/status
 */
const bulkUpdateUserStatus = async (req, res) => {
    try {
        const { userIds, action } = req.body

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('User IDs array is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!['ACTIVATE', 'SUSPEND', 'DEACTIVATE'].includes(action)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Action must be ACTIVATE, SUSPEND, or DEACTIVATE', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const results = {
            total: userIds.length,
            successful: 0,
            failed: 0,
            errors: []
        }

        const updateData = {
            isActive: action === 'ACTIVATE',
            isSuspended: action === 'SUSPEND',
            suspendedBy: action === 'SUSPEND' ? req.user._id : null,
            suspendedAt: action === 'SUSPEND' ? new Date() : null
        }

        for (const userId of userIds) {
            try {
                const user = await User.findById(userId)
                if (!user) {
                    results.failed++
                    results.errors.push({
                        userId,
                        error: 'User not found'
                    })
                    continue
                }

                // Prevent self-suspension
                if (userId === req.user._id.toString() && action === 'SUSPEND') {
                    results.failed++
                    results.errors.push({
                        userId,
                        error: 'Cannot suspend yourself'
                    })
                    continue
                }

                Object.assign(user, updateData)
                await user.save()
                results.successful++
            } catch (error) {
                results.failed++
                results.errors.push({
                    userId,
                    error: error.message
                })
            }
        }

        logger.info({
            type: 'bulk_user_status_update',
            action,
            total: results.total,
            successful: results.successful,
            failed: results.failed
        }, `Bulk ${action} ${results.successful} of ${results.total} users`)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(results, `Bulk ${action} completed`)
        )
    } catch (error) {
        logger.error({
            type: 'bulk_user_status_update_error',
            error: error.message
        }, 'Failed to bulk update user status')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to bulk update user status', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Import voters from CSV
 * POST /api/bulk/voters/import
 */
const importVotersFromCSV = async (req, res) => {
    try {
        const { electionId, csvData } = req.body

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!csvData) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('CSV data is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Parse CSV
        const parsed = papaparse.parse(csvData, {
            header: true,
            skipEmptyLines: true
        })

        if (parsed.errors.length > 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid CSV format', HTTP_STATUS.BAD_REQUEST, { errors: parsed.errors })
            )
        }

        const voters = parsed.data.map(row => ({
            email: row.email,
            firstname: row.firstname || row.firstName,
            lastname: row.lastname || row.lastName,
            phone: row.phone,
            studentId: row.studentId || row.student_id,
            yearOfStudy: row.yearOfStudy || row.year_of_study,
            department: row.department,
            verified: row.verified !== 'false',
            eligible: row.eligible !== 'false'
        }))

        // Use bulk register voters logic
        req.body.voters = voters
        return await bulkRegisterVoters(req, res)
    } catch (error) {
        logger.error({
            type: 'csv_import_error',
            error: error.message
        }, 'Failed to import voters from CSV')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to import voters from CSV', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    bulkRegisterVoters,
    bulkUpdateCandidates,
    bulkUpdateUserStatus,
    importVotersFromCSV
}

