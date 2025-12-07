const { param, query, body } = require('express-validator')
const mongoose = require('mongoose')

/**
 * Common validators used across multiple endpoints
 */

// Validate MongoDB ObjectId parameter
const validateObjectId = (paramName = 'id') => {
    return param(paramName)
        .notEmpty()
        .withMessage(`${ paramName } is required`)
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error(`Invalid ${ paramName } format. Must be a valid ObjectId`)
            }
            return true
        })
}

// Validate MongoDB ObjectId in body
const validateObjectIdBody = (fieldName) => {
    return body(fieldName)
        .notEmpty()
        .withMessage(`${ fieldName } is required`)
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error(`Invalid ${ fieldName } format. Must be a valid ObjectId`)
            }
            return true
        })
}

// Validate MongoDB ObjectId in query
const validateObjectIdQuery = (fieldName, required = false) => {
    const validator = query(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator.custom((value) => {
        if (value && !mongoose.Types.ObjectId.isValid(value)) {
            throw new Error(`Invalid ${ fieldName } format. Must be a valid ObjectId`)
        }
        return true
    })
}

// Pagination validators
const validatePagination = [
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

// Email validation
const validateEmail = (fieldName = 'email', required = true) => {
    const validator = body(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator
        .optional({ checkFalsy: !required })
        .isEmail()
        .withMessage(`Invalid ${ fieldName } format`)
        .normalizeEmail()
}

// Phone validation
const validatePhone = (fieldName = 'phone', required = false) => {
    const validator = body(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator
        .optional()
        .trim()
        .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
        .withMessage(`Invalid ${ fieldName } format`)
}

// Date validation
const validateDate = (fieldName, required = true) => {
    const validator = body(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator
        .optional({ checkFalsy: !required })
        .isISO8601()
        .withMessage(`${ fieldName } must be a valid ISO 8601 date`)
        .toDate()
}

// String validation
const validateString = (fieldName, options = {}) => {
    const { required = true, minLength, maxLength, trim = true } = options
    const validator = body(fieldName)

    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }

    if (trim) {
        validator.trim()
    }

    if (minLength !== undefined) {
        validator.isLength({ min: minLength }).withMessage(`${ fieldName } must be at least ${ minLength } characters`)
    }

    if (maxLength !== undefined) {
        validator.isLength({ max: maxLength }).withMessage(`${ fieldName } cannot exceed ${ maxLength } characters`)
    }

    return validator.optional({ checkFalsy: !required })
}

// Enum validation
const validateEnum = (fieldName, allowedValues, required = true) => {
    const validator = body(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator
        .optional({ checkFalsy: !required })
        .isIn(allowedValues)
        .withMessage(`${ fieldName } must be one of: ${ allowedValues.join(', ') }`)
}

// Boolean validation
const validateBoolean = (fieldName, required = false) => {
    const validator = body(fieldName)
    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }
    return validator
        .optional()
        .isBoolean()
        .withMessage(`${ fieldName } must be a boolean`)
        .toBoolean()
}

// Number validation
const validateNumber = (fieldName, options = {}) => {
    const { required = true, min, max } = options
    const validator = body(fieldName)

    if (required) {
        validator.notEmpty().withMessage(`${ fieldName } is required`)
    }

    const numValidator = validator
        .optional({ checkFalsy: !required })
        .isNumeric()
        .withMessage(`${ fieldName } must be a number`)
        .toFloat()

    if (min !== undefined) {
        numValidator.isFloat({ min }).withMessage(`${ fieldName } must be at least ${ min }`)
    }

    if (max !== undefined) {
        numValidator.isFloat({ max }).withMessage(`${ fieldName } must be at most ${ max }`)
    }

    return numValidator
}

// Validation result handler middleware
const validate = (req, res, next) => {
    const { validationResult } = require('express-validator')
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            message: 'Invalid input data',
            errors: errors.array()
        })
    }
    next()
}

module.exports = {
    validateObjectId,
    validateObjectIdBody,
    validateObjectIdQuery,
    validatePagination,
    validateEmail,
    validatePhone,
    validateDate,
    validateString,
    validateEnum,
    validateBoolean,
    validateNumber,
    validate
}

