const { body, param, query, validationResult } = require('express-validator')
const Poll = require('../models/Poll')

// Common validation rules
const validateObjectId = (field) => {
    return param(field)
        .isMongoId()
        .withMessage(`${ field } must be a valid MongoDB ObjectId`)
}

const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
]

// Create poll validation
const validateCreatePoll = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ min: 3, max: 200 })
        .withMessage('Title must be between 3 and 200 characters'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Description cannot exceed 2000 characters'),

    body('pollType')
        .optional()
        .isIn(['RATING', 'COMPARISON'])
        .withMessage('Poll type must be either RATING or COMPARISON'),

    body('category')
        .optional()
        .isIn(['COMPANY', 'POLITICIAN', 'SERVICE_PROVIDER', 'DEVICE', 'FOOD', 'RESTAURANT', 'APP', 'PRODUCT', 'SERVICE', 'PERSON', 'PLACE', 'EVENT', 'OTHER'])
        .withMessage('Invalid category'),

    // For RATING type polls
    body('subject.name')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Subject name cannot exceed 200 characters')
        .custom((value, { req }) => {
            if (req.body.pollType === 'RATING' || !req.body.pollType) {
                if (!value || value.trim() === '') {
                    throw new Error('Subject name is required for rating polls')
                }
            }
            return true
        }),

    body('subject.description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Subject description cannot exceed 1000 characters'),

    body('subject.image')
        .optional()
        .isURL()
        .withMessage('Subject image must be a valid URL'),

    body('subject.website')
        .optional()
        .isURL()
        .withMessage('Subject website must be a valid URL'),

    // For COMPARISON type polls
    body('options')
        .optional()
        .isArray({ min: 2, max: 10 })
        .withMessage('Comparison polls require 2-10 options')
        .custom((options, { req }) => {
            if (req.body.pollType === 'COMPARISON') {
                if (!options || options.length < 2) {
                    throw new Error('Comparison polls require at least 2 options')
                }
                if (options.length > 10) {
                    throw new Error('Comparison polls can have maximum 10 options')
                }
                // Validate each option
                options.forEach((option, index) => {
                    if (!option.name || option.name.trim() === '') {
                        throw new Error(`Option ${ index + 1 } must have a name`)
                    }
                })
            }
            return true
        }),

    body('options.*.name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Option name must be between 1 and 200 characters'),

    body('options.*.description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Option description cannot exceed 1000 characters'),

    body('options.*.image')
        .optional()
        .isURL()
        .withMessage('Option image must be a valid URL'),

    body('options.*.website')
        .optional()
        .isURL()
        .withMessage('Option website must be a valid URL'),

    body('ratingOptions.type')
        .optional()
        .isIn(['STARS', 'SCALE', 'YES_NO', 'CUSTOM'])
        .withMessage('Invalid rating type'),

    body('ratingOptions.minValue')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Min value must be at least 1'),

    body('ratingOptions.maxValue')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Max value must be at least 1')
        .custom((value, { req }) => {
            if (req.body.ratingOptions?.minValue && value < req.body.ratingOptions.minValue) {
                throw new Error('Max value must be greater than min value')
            }
            return true
        }),

    body('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date')
        .custom((value) => {
            if (new Date(value) < new Date()) {
                throw new Error('Start date cannot be in the past')
            }
            return true
        }),

    body('endDate')
        .notEmpty()
        .withMessage('End date is required')
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
        .custom((value, { req }) => {
            const endDate = new Date(value)
            const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date()
            if (endDate <= startDate) {
                throw new Error('End date must be after start date')
            }
            return true
        }),

    body('visibility')
        .optional()
        .isIn(['PUBLIC', 'PRIVATE', 'UNLISTED'])
        .withMessage('Invalid visibility setting'),

    body('settings.allowMultipleVotes')
        .optional()
        .isBoolean()
        .withMessage('allowMultipleVotes must be a boolean'),

    body('settings.requireRegistration')
        .optional()
        .isBoolean()
        .withMessage('requireRegistration must be a boolean'),

    body('settings.showResultsBeforeEnd')
        .optional()
        .isBoolean()
        .withMessage('showResultsBeforeEnd must be a boolean'),

    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array')
        .custom((tags) => {
            if (tags.length > 10) {
                throw new Error('Maximum 10 tags allowed')
            }
            return true
        }),

    body('tags.*')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Each tag cannot exceed 50 characters')
]

// Update poll validation
const validateUpdatePoll = [
    body('title')
        .optional()
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage('Title must be between 3 and 200 characters'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 2000 })
        .withMessage('Description cannot exceed 2000 characters'),

    body('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
        .custom((value, { req }) => {
            // If updating endDate, check it's after startDate
            // Note: We'll need to fetch the poll to check startDate
            return true
        }),

    body('visibility')
        .optional()
        .isIn(['PUBLIC', 'PRIVATE', 'UNLISTED'])
        .withMessage('Invalid visibility setting'),

    body('status')
        .optional()
        .isIn(['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'])
        .withMessage('Invalid status')
]

// Vote on poll validation
const validateVotePoll = [
    body('pollId')
        .isMongoId()
        .withMessage('Poll ID must be a valid MongoDB ObjectId'),

    // Rating is required for RATING type polls, selectedOptionId for COMPARISON type
    body('rating')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Rating must be a positive integer'),

    body('selectedOptionId')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Selected option ID cannot be empty'),

    body('comment')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Comment cannot exceed 1000 characters'),

    body('voterEmail')
        .optional()
        .isEmail()
        .withMessage('Voter email must be a valid email address')
        .normalizeEmail(),

    body('voterName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Voter name cannot exceed 100 characters')
]

// Poll ID validation
const validatePollId = [
    validateObjectId('pollId')
]

module.exports = {
    validateCreatePoll,
    validateUpdatePoll,
    validateVotePoll,
    validatePollId,
    validatePagination
}

