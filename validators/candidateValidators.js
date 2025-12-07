const { body, param } = require('express-validator')
const mongoose = require('mongoose')
const { validateObjectId, validateString, validateEnum, validate } = require('./commonValidators')

/**
 * Validators for candidate endpoints
 */

// Validate candidate creation
const validateCreateCandidate = [
    validateObjectId('electionId'),
    validateObjectId('positionId'),

    body('voterId')
        .notEmpty()
        .withMessage('Voter ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid voterId format. Must be a valid ObjectId')
            }
            return true
        }),

    validateString('fullName', { required: true, minLength: 2, maxLength: 100 }),
    validateString('displayName', { required: false, maxLength: 100 }),
    validateString('manifesto', { required: false, maxLength: 5000 }),
    validateString('campaignSlogan', { required: false, maxLength: 200 }),
    validateString('shortBio', { required: false, maxLength: 500 }),
    validateString('profileImage', { required: false, maxLength: 500 }),
    validateString('policyHighlights', { required: false, maxLength: 2000 }),

    body('policies')
        .optional()
        .isObject()
        .withMessage('Policies must be an object'),

    body('contactInfo')
        .optional()
        .isObject()
        .withMessage('Contact info must be an object'),

    body('contactInfo.email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format'),

    body('contactInfo.phone')
        .optional()
        .trim()
        .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
        .withMessage('Invalid phone format'),

    validateEnum('nominationStatus', ['SELF_NOMINATED', 'NOMINATED_BY_OTHERS', 'RECOMMENDED', 'AUTO_NOMINATED'], false),
    validate
]

// Validate candidate update
const validateUpdateCandidate = [
    validateObjectId('candidateId'),
    validateString('fullName', { required: false, minLength: 2, maxLength: 100 }),
    validateString('displayName', { required: false, maxLength: 100 }),
    validateString('manifesto', { required: false, maxLength: 5000 }),
    validateString('campaignSlogan', { required: false, maxLength: 200 }),
    validateEnum('status', ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'SUSPENDED'], false),
    validate
]

// Validate candidate approval
const validateApproveCandidate = [
    validateObjectId('candidateId'),
    validateEnum('status', ['APPROVED', 'REJECTED'], true),
    validateString('reviewNotes', { required: false, maxLength: 1000 }),
    validate
]

// Validate candidate ID parameter
const validateCandidateId = [
    validateObjectId('candidateId'),
    validate
]

// Validate election and position IDs
const validateElectionAndPositionIds = [
    validateObjectId('electionId'),
    validateObjectId('positionId'),
    validate
]

module.exports = {
    validateCreateCandidate,
    validateUpdateCandidate,
    validateApproveCandidate,
    validateCandidateId,
    validateElectionAndPositionIds
}

