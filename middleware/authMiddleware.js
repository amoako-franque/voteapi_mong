const authService = require('../services/authService')
const logger = require('../utils/logger')
const User = require('../models/User')

/**
 * Unified Authentication middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'No token provided'
            })
        }

        const token = authHeader.substring(7)

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'No token provided'
            })
        }

        // Check if token is blacklisted
        try {
            const BlacklistedToken = require('../models/BlacklistedToken')
            const crypto = require('crypto')
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
            const isBlacklisted = await BlacklistedToken.isBlacklisted(tokenHash)

            if (isBlacklisted) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Token has been revoked. Please log in again.'
                })
            }
        } catch (error) {
            logger.warn({ type: 'blacklist_check_error', error: error.message }, 'Failed to check token blacklist')
            // Continue with token verification if blacklist check fails
        }

        // Verify token using authService which uses verifyAccessToken
        let decoded
        try {
            decoded = await authService.verifyToken(token)
        } catch (error) {
            if (error.message && error.message.includes('Invalid access token')) {
                if (error.message.includes('invalid signature')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Token signature is invalid. Please log in again to get a new token.'
                    })
                }
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: error.message || 'Invalid token. Please log in again.'
                })
            }
            if (error.message && error.message.includes('expired')) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Token has expired. Please log in again.'
                })
            }
            if (error.message && error.message.includes('not active')) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Token is not active yet. Please try again later.'
                })
            }
            if (error.name === 'JsonWebTokenError') {
                if (error.message.includes('invalid signature')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Unauthorized',
                        message: 'Token signature is invalid. Please log in again to get a new token.'
                    })
                }
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Invalid token. Please log in again.'
                })
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Token has expired. Please log in again.'
                })
            }
            throw error
        }

        const user = await User.findById(decoded.userId)

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'User not found'
            })
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'Account is not active'
            })
        }

        // Attach user to request
        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            firstName: user.firstname,
            lastName: user.lastname,
            permissions: user.permissions,
            schoolId: user.schoolId,
            associationId: user.associationId
        }

        next()
    } catch (error) {
        logger.error({
            err: error,
            message: 'Authentication middleware error',
            token: req.headers.authorization ? 'Bearer [HIDDEN]' : 'No token'
        })

        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: error.message || 'Invalid token'
        })
    }
}

// admin check middleware
const adminCheckMiddleware = async (req, res, next) => {
    try {
        // Get user from request
        const user = req.user

        // Check if user is admin
        if (user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Admin access required'
            })
        }

        next()
    } catch (error) {
        logger.error({
            err: error,
            message: 'Admin check middleware error',
            token: req.headers.authorization ? 'Bearer [HIDDEN]' : 'No token'
        })

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: error.message || 'Admin access required'
        })
    }
}

// super admin check middleware
const superAdminCheckMiddleware = async (req, res, next) => {
    try {
        // Get user from request
        const user = req.user

        // Check if user is super admin
        if (user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Super admin access required'
            })
        }
        next()
    } catch (error) {
        logger.error({
            err: error,
            message: 'Super admin check middleware error',
            token: req.headers.authorization ? 'Bearer [HIDDEN]' : 'No token'
        })

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: error.message || 'Super admin access required'
        })
    }
}

// school admin check middleware
const schoolAdminCheckMiddleware = async (req, res, next) => {
    try {
        // Get user from request
        const user = req.user
        // Check if user is school admin
        if (user.role !== 'SCHOOL_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'School admin access required'
            })
        }
        next()

    } catch (error) {
        logger.error({
            err: error,
            message: 'School admin check middleware error',
            token: req.headers.authorization ? 'Bearer [HIDDEN]' : 'No token'
        })

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: error.message || 'School admin access required'
        })
    }
}

// association admin check middleware
const associationAdminCheckMiddleware = async (req, res, next) => {
    try {
        // Get user from request

        const user = req.user
        // Check if user is association admin
        if (user.role !== 'ASSOCIATION_ADMIN') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Association admin access required'
            })
        }
        next()
    } catch (error) {
        logger.error({
            err: error,
            message: 'Association admin check middleware error',
            token: req.headers.authorization ? 'Bearer [HIDDEN]' : 'No token'
        })
    }

    return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message || 'Association admin access required'
    })
}

module.exports = { authMiddleware, adminCheckMiddleware, superAdminCheckMiddleware, schoolAdminCheckMiddleware, associationAdminCheckMiddleware }
