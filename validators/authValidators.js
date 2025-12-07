const { body, validationResult } = require('express-validator')

// Helper function to check validation results
const validate = (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            errors: errors.array()
        })
    }
    next()
}

// Login validation
const login = [
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
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),

    validate
]

// Register validation
const register = [
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
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&), and must be at least 8 characters long'),

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

    body('role')
        .optional()
        .isIn(['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN'])
        .withMessage('Role must be SCHOOL_ADMIN, ASSOCIATION_ADMIN, or PROFESSIONAL_ASSOCIATION_ADMIN'),

    validate
]

// Forgot password validation
const forgotPassword = [
    body('email')
        .notEmpty()
        .isEmail()
        .withMessage('Please provide a valid email address. Email is required')
        .normalizeEmail()
        .toLowerCase(),

    validate
]

// Reset password validation
const resetPassword = [
    body('resetToken')
        .notEmpty()
        .withMessage('Reset token is required'),

    body('newPassword')
        .notEmpty()
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'),

    validate
]

// Update profile validation
const updateProfile = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),

    body('lastName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),

    body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
        .toLowerCase(),

    validate
]

// Change password validation
const changePassword = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),

    body('newPassword')
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

    validate
]

module.exports = {
    login,
    register,
    forgotPassword,
    resetPassword,
    updateProfile,
    changePassword
}

