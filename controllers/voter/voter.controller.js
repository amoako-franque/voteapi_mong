const mongoose = require('mongoose')
const VoterRegistry = require('../../models/VoterRegistry')
const Election = require('../../models/Election')
const School = require('../../models/School')
const Association = require('../../models/Association')
const crypto = require('crypto')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Generate unique voterId with school code prefix
 * Format: {CODE}-{RANDOM_HEX}
 * Example: UNIV-abc123def456
 */
const generateVoterId = async (schoolId) => {
    if (!schoolId) {
        throw new Error('schoolId is required')
    }

    // Get school code
    const school = await School.findById(schoolId)
    if (!school) {
        throw new Error('School not found')
    }
    const schoolCode = school.code || 'SCH'

    // Generate unique voterId
    let voterId
    let attempts = 0
    const maxAttempts = 10

    do {
        // Generate random hex string (12 characters)
        const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase()
        voterId = `${ schoolCode }-${ randomPart }`

        // Check uniqueness - must be unique within the school
        const query = { voterId, schoolId }

        const existingVoter = await VoterRegistry.findOne(query)

        if (!existingVoter) {
            break
        }

        attempts++
        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique voterId after multiple attempts')
        }
    } while (true)

    return voterId
}

/**
 * Add a single voter to a school
 * Voters are not tied to specific elections - they can vote in elections they're eligible for
 */
const addVoter = async (req, res) => {
    try {
        const userId = req.user.id
        const {
            firstName,
            lastName,
            email,
            phone,
            studentNumber,
            employeeNumber,
            gender,
            dateOfBirth,
            yearOfStudy,
            // Association
            associationId,
            schoolId
        } = req.body

        // Validate that schoolId is provided
        if (!schoolId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voter must belong to a school', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify school exists
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

        // Validate association if provided
        if (associationId) {
            const association = await Association.findById(associationId)
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
            // Validate association belongs to the same school (if applicable)
            if (association.schoolId && association.schoolId.toString() !== schoolId.toString()) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Association does not belong to the specified school', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Check if voter already exists (by email with the same school)
        const emailQuery = {
            email: email.toLowerCase(),
            schoolId
        }

        const existingVoter = await VoterRegistry.findOne(emailQuery)

        if (existingVoter) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Voter with this email already exists in this school', HTTP_STATUS.CONFLICT)
            )
        }

        // Generate unique voterId with school code prefix
        const generatedVoterId = await generateVoterId(schoolId)

        // Create new voter
        const voter = await VoterRegistry.create({
            voterId: generatedVoterId,
            firstName,
            lastName,
            fullName: `${ firstName } ${ lastName }`,
            email: email.toLowerCase(),
            phone,
            studentNumber,
            employeeNumber,
            gender,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            yearOfStudy,
            // Association
            associationId: associationId || undefined,
            // School
            schoolId: schoolId,
            registrationSource: 'MANUAL',
            eligibilityStatus: 'ELIGIBLE',
            isActive: true,
            isVerified: true,
            verifiedAt: new Date(),
            verificationMethod: 'MANUAL',
            createdBy: userId
        })

        logger.info({
            type: 'voter_added',
            voterId: voter._id,
            schoolId,
            userId
        }, 'Voter added successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(voter, 'Voter added successfully')
        )
    } catch (error) {
        logger.error({
            type: 'voter_add_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to add voter')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to add voter', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Bulk add voters to a school
 */
const bulkAddVoters = async (req, res) => {
    try {
        const userId = req.user.id
        const { voters, schoolId } = req.body // Array of voter objects

        if (!Array.isArray(voters) || voters.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Voters array is required and must not be empty', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Validate that schoolId is provided
        if (!schoolId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('schoolId is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify school exists
        const school = await School.findById(schoolId)
        if (!school || !school.isActive || !school.isVerified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('School must exist, be active and verified', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const results = {
            success: [],
            failed: [],
            skipped: []
        }

        // Process each voter
        for (const voterData of voters) {
            try {
                const {
                    firstName,
                    lastName,
                    email,
                    phone,
                    studentNumber,
                    employeeNumber,
                    gender,
                    dateOfBirth,
                    yearOfStudy,
                    // Association
                    associationId: voterAssocIdFromData,
                    schoolId: voterSchoolIdFromData
                } = voterData

                // Validate required fields
                if (!firstName || !lastName || !email) {
                    results.failed.push({
                        voterData,
                        reason: 'Missing required fields: firstName, lastName, or email'
                    })
                    continue
                }

                // Use voter-specific schoolId if provided, otherwise use from request body
                const voterSchoolId = voterSchoolIdFromData !== undefined ? voterSchoolIdFromData : schoolId

                // Validate that schoolId is provided
                if (!voterSchoolId) {
                    results.failed.push({
                        voterData,
                        reason: 'Voter must belong to a school'
                    })
                    continue
                }

                // Validate association if provided
                if (voterAssocIdFromData) {
                    try {
                        const association = await Association.findById(voterAssocIdFromData)
                        if (!association || !association.isActive || !association.isVerified) {
                            results.failed.push({
                                voterData,
                                reason: 'Association not found, inactive, or unverified'
                            })
                            continue
                        }
                        // Validate association belongs to the same school (if applicable)
                        if (association.schoolId && association.schoolId.toString() !== voterSchoolId.toString()) {
                            results.failed.push({
                                voterData,
                                reason: 'Association does not belong to the specified school'
                            })
                            continue
                        }
                    } catch (error) {
                        results.failed.push({
                            voterData,
                            reason: `Association validation error: ${ error.message }`
                        })
                        continue
                    }
                }

                // Check if voter already exists (by email with the same school)
                const emailQuery = {
                    email: email.toLowerCase(),
                    schoolId: voterSchoolId
                }

                const existingVoter = await VoterRegistry.findOne(emailQuery)

                if (existingVoter) {
                    results.skipped.push({
                        email,
                        reason: 'Voter with this email already exists'
                    })
                    continue
                }

                // Generate unique voterId with school code prefix
                let generatedVoterId
                try {
                    generatedVoterId = await generateVoterId(voterSchoolId)
                } catch (error) {
                    results.failed.push({
                        voterData,
                        reason: `Failed to generate voterId: ${ error.message }`
                    })
                    continue
                }

                // Create new voter
                const voter = await VoterRegistry.create({
                    voterId: generatedVoterId,
                    firstName,
                    lastName,
                    fullName: `${ firstName } ${ lastName }`,
                    email: email.toLowerCase(),
                    phone,
                    studentNumber,
                    employeeNumber,
                    gender,
                    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                    yearOfStudy,
                    // Association
                    associationId: voterAssocIdFromData || undefined,
                    // School
                    schoolId: voterSchoolId,
                    registrationSource: 'BULK_UPLOAD',
                    eligibilityStatus: 'ELIGIBLE',
                    isActive: true,
                    isVerified: true,
                    verifiedAt: new Date(),
                    verificationMethod: 'MANUAL',
                    createdBy: userId
                })

                results.success.push({
                    email,
                    action: 'created',
                    voterId: voter._id
                })
            } catch (error) {
                results.failed.push({
                    voterData,
                    reason: error.message
                })
            }
        }

        logger.info({
            type: 'bulk_voters_added',
            schoolId,
            userId,
            total: voters.length,
            success: results.success.length,
            failed: results.failed.length,
            skipped: results.skipped.length
        }, 'Bulk voters processed')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                summary: {
                    total: voters.length,
                    success: results.success.length,
                    failed: results.failed.length,
                    skipped: results.skipped.length
                },
                results
            }, 'Bulk voter registration completed')
        )
    } catch (error) {
        logger.error({
            type: 'bulk_voter_add_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to bulk add voters')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to bulk add voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get voters for a school
 */
const getVoters = async (req, res) => {
    try {
        const { schoolId, associationId, page = 1, limit = 50, status } = req.query

        // Validate ObjectIds if provided
        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid schoolId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (associationId && !mongoose.Types.ObjectId.isValid(associationId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid associationId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Validate that schoolId is provided
        if (!schoolId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('schoolId is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const query = { schoolId }

        if (associationId) {
            query.associationId = associationId
        }

        if (status) {
            query.eligibilityStatus = status
        }

        const voters = await VoterRegistry.find(query)
            .populate('schoolId', 'name code')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)

        const total = await VoterRegistry.countDocuments(query)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                voters,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }, 'Voters retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_voters_error',
            error: error.message
        }, 'Failed to retrieve voters')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get eligible voters for an election
 * Determines eligibility based on voter's school/organization/department membership
 */
const getEligibleVotersForElection = async (req, res) => {
    try {
        const { electionId } = req.params
        const { page = 1, limit = 50 } = req.query

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(electionId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid electionId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get election
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Build query based on election scope
        const query = {
            isActive: true,
            isVerified: true,
            eligibilityStatus: 'ELIGIBLE'
        }

        // Filter by election scope
        switch (election.scope) {
            case 'SCHOOL':
                if (!election.schoolId) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(
                        responseFormatter.error('Election must have a schoolId for SCHOOL scope', HTTP_STATUS.BAD_REQUEST)
                    )
                }
                // Voter must belong to this school (can also belong to an organization)
                query.schoolId = election.schoolId
                break

            case 'ASSOCIATION':
                // For association elections, voters must belong to that specific association
                if (!election.associationId) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(
                        responseFormatter.error('Association election must have an associationId', HTTP_STATUS.BAD_REQUEST)
                    )
                }
                // Voter must belong to the same school (if applicable) AND the same association
                if (election.schoolId) {
                    query.schoolId = election.schoolId
                }
                // Filter by association - voters must belong to this specific association
                query.associationId = election.associationId
                break

            case 'PUBLIC':
                // Public elections - all active verified voters
                break
        }

        const voters = await VoterRegistry.find(query)
            .populate('schoolId', 'name code')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)

        const total = await VoterRegistry.countDocuments(query)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                election: {
                    id: election._id,
                    title: election.title,
                    scope: election.scope
                },
                voters,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }, 'Eligible voters retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_eligible_voters_error',
            error: error.message
        }, 'Failed to retrieve eligible voters')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve eligible voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

//update voter eligibility status
const updateVoterEligibilityStatus = async (req, res) => { }

const suspendVoter = async (req, res) => { }

const reactivateVoter = async (req, res) => { }

const verifyVoter = async (req, res) => { }

const updateVoter = async (req, res) => { }

const deleteVoter = async (req, res) => { }

module.exports = {
    addVoter,
    bulkAddVoters,
    getVoters,
    getEligibleVotersForElection
}
