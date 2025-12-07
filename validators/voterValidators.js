const { body, param, query } = require('express-validator')
const mongoose = require('mongoose')
const { validateObjectId, validateObjectIdQuery, validateString, validateEmail, validatePhone, validateDate, validateEnum, validateBoolean, validatePagination, validate } = require('./commonValidators')

/**
 * Validators for voter endpoints
 */

// Validate voter creation
const validateCreateVoter = [
    validateString('firstName', { required: true, minLength: 2, maxLength: 50 }),
    validateString('lastName', { required: true, minLength: 2, maxLength: 50 }),
    validateEmail('email', true),
    validatePhone('phone', false),
    validateString('studentNumber', { required: false, maxLength: 50 }),
    validateString('employeeNumber', { required: false, maxLength: 50 }),
    validateEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'], false),
    validateDate('dateOfBirth', false),
    validateString('yearOfStudy', { required: false, maxLength: 20 }),

    body('schoolId')
        .notEmpty()
        .withMessage('School ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid schoolId format. Must be a valid ObjectId')
            }
            return true
        }),

    body('associationId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid associationId format. Must be a valid ObjectId')
            }
            return true
        }),

    validate
]

// Validate bulk voter creation
const validateBulkCreateVoters = [
    body('voters')
        .isArray({ min: 1 })
        .withMessage('Voters must be a non-empty array'),

    body('voters.*.firstName')
        .notEmpty()
        .withMessage('First name is required for all voters')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('voters.*.lastName')
        .notEmpty()
        .withMessage('Last name is required for all voters')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('voters.*.email')
        .notEmpty()
        .withMessage('Email is required for all voters')
        .isEmail()
        .withMessage('Invalid email format'),

    body('schoolId')
        .notEmpty()
        .withMessage('School ID is required')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid schoolId format. Must be a valid ObjectId')
            }
            return true
        }),

    validate
]

// Validate voter update
const validateUpdateVoter = [
    validateObjectId('id'),
    validateString('firstName', { required: false, minLength: 2, maxLength: 50 }),
    validateString('lastName', { required: false, minLength: 2, maxLength: 50 }),
    validateEmail('email', false),
    validatePhone('phone', false),
    validateEnum('eligibilityStatus', ['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING', 'VERIFIED', 'SUSPENDED'], false),
    validateBoolean('isActive', false),
    validateBoolean('isVerified', false),
    validate
]

// Validate voter ID parameter
const validateVoterId = [
    validateObjectId('id'),
    validate
]

// Validate get voters query
const validateGetVoters = [
    validateObjectIdQuery('schoolId', false),
    validateObjectIdQuery('associationId', false),
    validateEnum('status', ['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING', 'VERIFIED', 'SUSPENDED'], false).optional(),
    ...validatePagination,
    validate
]

// Validate election ID for eligible voters
const validateElectionIdForEligibleVoters = [
    validateObjectId('electionId'),
    validate
]

module.exports = {
    validateCreateVoter,
    validateBulkCreateVoters,
    validateUpdateVoter,
    validateVoterId,
    validateGetVoters,
    validateElectionIdForEligibleVoters
}

