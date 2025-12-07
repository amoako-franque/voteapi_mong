const { body, param } = require('express-validator')
const { validateObjectId, validateString, validateEmail, validatePhone, validateBoolean, validateEnum, validate } = require('./commonValidators')

/**
 * Validators for school endpoints
 */

// Validate school creation
const validateCreateSchool = [
    validateString('name', { required: true, minLength: 3, maxLength: 200 }),
    validateString('shortName', { required: false, maxLength: 50 }),
    validateString('code', { required: true, minLength: 2, maxLength: 20 }),
    validateString('type', { required: false, maxLength: 50 }),
    validateString('address', { required: false, maxLength: 500 }),
    validateString('city', { required: false, maxLength: 100 }),
    validateString('region', { required: false, maxLength: 100 }),
    validateString('country', { required: false, maxLength: 100 }),
    validatePhone('phone', false),
    validateEmail('email', false),
    validateString('website', { required: false, maxLength: 200 }),
    validateBoolean('isActive', false),
    validateBoolean('isVerified', false),
    validate
]

// Validate school update
const validateUpdateSchool = [
    validateObjectId('id'),
    validateString('name', { required: false, minLength: 3, maxLength: 200 }),
    validateString('shortName', { required: false, maxLength: 50 }),
    validateString('code', { required: false, minLength: 2, maxLength: 20 }),
    validateEmail('email', false),
    validatePhone('phone', false),
    validateBoolean('isActive', false),
    validateBoolean('isVerified', false),
    validate
]

// Validate school ID parameter
const validateSchoolId = [
    validateObjectId('id'),
    validate
]

module.exports = {
    validateCreateSchool,
    validateUpdateSchool,
    validateSchoolId
}

