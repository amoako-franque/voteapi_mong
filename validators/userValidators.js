const { body, param, query } = require('express-validator')
const { validateObjectId, validate } = require('./commonValidators')

/**
 * Validate user profile update
 */
const validateUpdateProfile = [
    body('firstname')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('lastname')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('phone')
        .optional()
        .trim()
        .isLength({ min: 10, max: 15 })
        .withMessage('Phone number must be between 10 and 15 characters')
        .matches(/^[\+]?[1-9][\d]{0,15}$/)
        .withMessage('Phone number must be a valid number'),

    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    validate
]

/**
 * Validate password change
 */
const validateChangePassword = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'),

    validate
]

/**
 * Validate election officer creation
 */
const validateCreateElectionOfficer = [
    body('email')
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
        .toLowerCase(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'),

    body('firstname')
        .notEmpty()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('lastname')
        .notEmpty()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('phone')
        .notEmpty()
        .withMessage('Phone number is required')
        .trim()
        .isLength({ min: 10, max: 15 })
        .withMessage('Phone number must be between 10 and 15 characters')
        .matches(/^[\+]?[1-9][\d]{0,15}$/)
        .withMessage('Phone number must be a valid number'),

    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    validate
]

/**
 * Validate election officer update
 */
const validateUpdateElectionOfficer = [
    body('firstname')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('lastname')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('phone')
        .optional()
        .trim()
        .isLength({ min: 10, max: 15 })
        .withMessage('Phone number must be between 10 and 15 characters')
        .matches(/^[\+]?[1-9][\d]{0,15}$/)
        .withMessage('Phone number must be a valid number'),

    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),

    validate
]

/**
 * Validate election officer ID parameter
 */
const validateElectionOfficerId = [
    validateObjectId('id'),
    validate
]

/**
 * Validate pagination query parameters
 */
const validateGetElectionOfficers = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

    validate
]

module.exports = {
    validateUpdateProfile,
    validateChangePassword,
    validateCreateElectionOfficer,
    validateUpdateElectionOfficer,
    validateElectionOfficerId,
    validateGetElectionOfficers
}

