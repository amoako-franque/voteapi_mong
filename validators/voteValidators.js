const { body, param, query } = require('express-validator')
const mongoose = require('mongoose')

/**
 * Validators for vote-related endpoints
 */

// Validate secret code format
const validateSecretCode = body('secretCode')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('Secret code must be exactly 6 characters')
    .matches(/^[A-Z0-9]{6}$/)
    .withMessage('Secret code must contain 2 letters and 4 numbers (e.g., AB1234)')
    .toUpperCase()

// Validate vote submission
const validateVoteSubmission = [
    body('electionId')
        .notEmpty()
        .withMessage('Election ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid election ID format')
            }
            return true
        }),

    body('positionId')
        .notEmpty()
        .withMessage('Position ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid position ID format')
            }
            return true
        }),

    body('candidateId')
        .notEmpty()
        .withMessage('Candidate ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid candidate ID format')
            }
            return true
        }),

    body('voterId')
        .notEmpty()
        .withMessage('Voter ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid voter ID format')
            }
            return true
        }),

    validateSecretCode,

    body('voterIdNumber')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Voter ID number must be between 1 and 50 characters'),

    body('isAbstention')
        .optional()
        .isBoolean()
        .withMessage('isAbstention must be a boolean'),

    body('abstentionReason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Abstention reason cannot exceed 500 characters')
        .custom((value, { req }) => {
            if (req.body.isAbstention && !value) {
                throw new Error('Abstention reason is required when abstaining')
            }
            return true
        }),

    body('voteType')
        .optional()
        .isIn(['FIRST_CHOICE', 'SECOND_CHOICE', 'THIRD_CHOICE', 'APPROVAL', 'WRITE_IN'])
        .withMessage('Invalid vote type'),

    body('deviceFingerprint')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Device fingerprint cannot exceed 255 characters'),

    body('clientInfo')
        .optional()
        .isObject()
        .withMessage('Client info must be an object')
]

// Validate secret code validation request
const validateSecretCodeValidation = [
    body('voterId')
        .notEmpty()
        .withMessage('Voter ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid voter ID format')
            }
            return true
        }),

    body('electionId')
        .notEmpty()
        .withMessage('Election ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid election ID format')
            }
            return true
        }),

    body('positionId')
        .notEmpty()
        .withMessage('Position ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid position ID format')
            }
            return true
        }),

    validateSecretCode
]

// Validate vote ID parameter
const validateVoteId = param('id')
    .notEmpty()
    .withMessage('Vote ID is required')
    .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid vote ID format')
        }
        return true
    })

// Validate election ID parameter
const validateElectionId = param('electionId')
    .notEmpty()
    .withMessage('Election ID is required')
    .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid election ID format')
        }
        return true
    })

// Validate query parameters for getting votes
const validateGetVotesQuery = [
    query('electionId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid election ID format')
            }
            return true
        }),

    query('positionId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid position ID format')
            }
            return true
        }),

    query('voterId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid voter ID format')
            }
            return true
        }),

    query('status')
        .optional()
        .isIn(['CAST', 'VERIFIED', 'COUNTED', 'DISPUTED', 'INVALID', 'RECOUNTED'])
        .withMessage('Invalid vote status'),

    query('verified')
        .optional()
        .isBoolean()
        .withMessage('Verified must be a boolean'),

    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt()
]

// Validate vote verification
const validateVoteVerification = [
    validateVoteId,

    body('verificationMethod')
        .optional()
        .isIn(['AUTOMATIC', 'MANUAL', 'ADMIN_VERIFIED'])
        .withMessage('Invalid verification method')
]

module.exports = {
    validateVoteSubmission,
    validateSecretCodeValidation,
    validateVoteId,
    validateElectionId,
    validateGetVotesQuery,
    validateVoteVerification
}

