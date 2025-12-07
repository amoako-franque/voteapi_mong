const { body, param } = require('express-validator')
const mongoose = require('mongoose')
const { validateObjectId, validateString, validateEmail, validatePhone, validateEnum, validateBoolean, validate } = require('./commonValidators')

/**
 * Validators for association endpoints
 */

// Validate association creation
const validateCreateAssociation = [
    validateString('name', { required: true, minLength: 3, maxLength: 200 }),
    validateString('code', { required: true, minLength: 2, maxLength: 20 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateEnum('type', ['STUDENT_BODY', 'PROFESSIONAL', 'CLUB', 'SOCIETY', 'CUSTOM'], false),

    body('schoolId')
        .optional()
        .custom((value) => {
            if (value && !mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid schoolId format. Must be a valid ObjectId')
            }
            return true
        }),

    validateEmail('email', false),
    validatePhone('phone', false),
    validateString('website', { required: false, maxLength: 200 }),
    validateString('address', { required: false, maxLength: 500 }),
    validateBoolean('isActive', false),
    validateBoolean('isVerified', false),
    validate
]

// Validate association update
const validateUpdateAssociation = [
    validateObjectId('id'),
    validateString('name', { required: false, minLength: 3, maxLength: 200 }),
    validateString('code', { required: false, minLength: 2, maxLength: 20 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateEmail('email', false),
    validatePhone('phone', false),
    validateBoolean('isActive', false),
    validateBoolean('isVerified', false),
    validate
]

// Validate association ID parameter
const validateAssociationId = [
    validateObjectId('id'),
    validate
]

module.exports = {
    validateCreateAssociation,
    validateUpdateAssociation,
    validateAssociationId
}

