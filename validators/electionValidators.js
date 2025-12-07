const { body, param } = require('express-validator')
const mongoose = require('mongoose')
const { validateObjectId, validateString, validateDate, validateEnum, validateBoolean, validate } = require('./commonValidators')
const HTTP_STATUS = require('../utils/constants').HTTP_STATUS

/**
 * Validators for election endpoints
 */

// Validate election creation
const validateCreateElection = [
    validateString('title', { required: true, minLength: 3, maxLength: 200 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateEnum('type', ['SRC_ELECTION', 'CLASS_REPRESENTATIVE', 'GENERAL_ELECTION', 'REFERENDUM', 'CUSTOM', 'ASSOCIATION_ELECTION'], true),
    validateEnum('scope', ['SCHOOL', 'ASSOCIATION', 'PUBLIC'], true),
    validateDate('startDateTime', true),
    validateDate('endDateTime', true),
    validateString('timezone', { required: false, maxLength: 50 }),

    // School/Association validation
    body('schoolId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
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

    body('associationCode')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Association code cannot exceed 50 characters'),

    // Scope-specific validation
    body('scope').custom((scope, { req }) => {
        if (scope === 'SCHOOL' && !req.body.schoolId) {
            throw new Error('School ID is required for school elections')
        }
        if (scope === 'ASSOCIATION' && !req.body.associationId && !req.body.associationCode) {
            throw new Error('Association ID or code is required for association elections')
        }
        return true
    }),

    // Date validation
    body('endDateTime').custom((endDateTime, { req }) => {
        if (req.body.startDateTime && new Date(endDateTime) <= new Date(req.body.startDateTime)) {
            throw new Error('End date must be after start date')
        }
        return true
    }),

    validateDate('registrationDeadline', false),
    validateDate('candidateNominationDeadline', false),

    body('campaignPeriod')
        .optional()
        .isObject()
        .withMessage('Campaign period must be an object'),

    body('campaignPeriod.startDate')
        .optional()
        .isISO8601()
        .withMessage('Campaign start date must be a valid ISO 8601 date'),

    body('campaignPeriod.endDate')
        .optional()
        .isISO8601()
        .withMessage('Campaign end date must be a valid ISO 8601 date'),

    body('settings')
        .optional()
        .isObject()
        .withMessage('Settings must be an object'),

    body('votingRules')
        .optional()
        .isObject()
        .withMessage('Voting rules must be an object'),

    validate
]

// Validate election update
const validateUpdateElection = [
    validateObjectId('electionId'),
    validateString('title', { required: false, minLength: 3, maxLength: 200 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateEnum('status', ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FROZEN'], false),
    validateDate('startDateTime', false),
    validateDate('endDateTime', false),
    validateDate('registrationDeadline', false),
    validateDate('candidateNominationDeadline', false),
    validate
]

// Validate election ID parameter
const validateElectionId = [
    validateObjectId('electionId'),
    validate
]

// Validate phase transition
const validatePhaseTransition = [
    validateObjectId('electionId'),
    validateEnum('phase', ['REGISTRATION', 'NOMINATION', 'CAMPAIGN', 'VOTING', 'RESULTS', 'COMPLETED'], true),
    validate
]

module.exports = {
    validateCreateElection,
    validateUpdateElection,
    validateElectionId,
    validatePhaseTransition
}

