const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const authService = require('../../services/authService')
const auditLogService = require('../../services/auditLogService')
const emailService = require('../../services/emailService')
const { generatePasswordResetToken } = require('../../utils/generateToken')
const Token = require('../../models/Token')
const { TOKEN_TYPES } = Token
const User = require('../../models/User')

const getRequestContext = (req) => {
    return {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        deviceFingerprint: req.deviceFingerprint,
        metadata: {
            path: req.originalUrl,
            method: req.method
        }
    }
}

const register = async (req, res) => {
    try {
        const { email, password, firstname, lastname, phone, role } = req.body

        const existingUser = await User.findOne({
            $or: [{ email: email.toLowerCase() }, { phone }]
        })

        if (existingUser) {
            return res.status(HTTP_STATUS.CONFLICT).json(responseFormatter.conflict('User with provided email or phone already exists'))
        }

        const hashedPassword = await authService.hashPassword(password)

        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstname,
            lastname,
            phone,
            role: role,
            verified: false
        })

        const context = getRequestContext(req)

        const tokens = await authService.issueAuthTokens(user, {
            res,
            ...context
        })

        await auditLogService.logSecurityAction(
            user._id,
            'ACCOUNT_CREATED',
            {
                ...context,
                email: user.email
            },
            true,
            req
        )

        logger.info({ type: 'auth_register', userId: user._id }, 'User registered successfully')

        return res.status(HTTP_STATUS.CREATED).json(responseFormatter.created({
            user: authService.buildSafeUser(user),
            tokens
        }, 'Registration successful'))
    } catch (error) {
        logger.error({ type: 'auth_register_error', error: error.message }, 'Registration failed')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(responseFormatter.error('Unable to register user', HTTP_STATUS.INTERNAL_SERVER_ERROR))
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await authService.findUserByEmail(email, true)

        if (!user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(responseFormatter.unauthorized('Invalid credentials'))
        }

        if (user.isLocked) {
            await auditLogService.logSecurityAction(user._id, 'ACCOUNT_LOCKED', getRequestContext(req), false, req)
            return res.status(HTTP_STATUS.FORBIDDEN).json(responseFormatter.forbidden('Account is locked. Please contact support.'))
        }

        if (!user.isActive) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(responseFormatter.forbidden('Account is inactive'))
        }

        const isPasswordValid = await authService.comparePassword(password, user.password)

        if (!isPasswordValid) {
            await user.incrementLoginAttempts()
            const context = getRequestContext(req)

            // Log failed login
            const LoginLog = require('../models/LoginLog')
            await LoginLog.create({
                userId: user._id,
                email: user.email,
                success: false,
                failureReason: 'Invalid credentials',
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
                deviceInfo: context.deviceInfo || {}
            })

            await auditLogService.logSecurityAction(user._id, 'LOGIN_FAILED', {
                ...context,
                reason: 'Invalid credentials'
            }, false, req)
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(responseFormatter.unauthorized('Invalid credentials'))
        }

        await User.updateOne(
            { _id: user._id },
            {
                $unset: { loginAttempts: 1, lockUntil: 1 },
                $set: { lastLogin: new Date() }
            }
        )

        const context = getRequestContext(req)

        const tokens = await authService.issueAuthTokens(user, {
            res,
            ...context
        })

        // Log successful login
        const LoginLog = require('../models/LoginLog')
        await LoginLog.create({
            userId: user._id,
            email: user.email,
            success: true,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            deviceInfo: context.deviceInfo || {}
        })

        logger.info({ type: 'auth_login', userId: user._id }, 'User logged in successfully')

        return res.status(HTTP_STATUS.OK).json(responseFormatter.success({
            user: authService.buildSafeUser(user),
            tokens
        }, 'Login successful'))
    } catch (error) {
        logger.error({ type: 'auth_login_error', error: error.message }, 'Login failed')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(responseFormatter.error('Unable to login', HTTP_STATUS.INTERNAL_SERVER_ERROR))
    }
}

const refreshTokens = async (req, res) => {
    try {
        const incomingRefreshToken = authService.getRefreshTokenFromRequest(req)

        if (!incomingRefreshToken) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(responseFormatter.unauthorized('Refresh token is required'))
        }

        const { tokenDoc, userDoc } = await authService.validateRefreshToken(incomingRefreshToken)

        const context = getRequestContext(req)

        const tokens = await authService.refreshAuthTokens(userDoc, incomingRefreshToken, {
            res,
            ...context
        }, tokenDoc)

        await auditLogService.logSecurityAction(userDoc._id, 'TOKEN_REFRESHED', context, true, req)

        logger.info({ type: 'auth_refresh', userId: userDoc._id }, 'Refresh token rotated successfully')

        return res.status(HTTP_STATUS.OK).json(responseFormatter.success({
            user: authService.buildSafeUser(userDoc),
            tokens
        }, 'Token refreshed successfully'))
    } catch (error) {
        logger.error({ type: 'auth_refresh_error', error: error.message }, 'Token refresh failed')
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(responseFormatter.unauthorized(error.message || 'Unable to refresh tokens'))
    }
}

const logout = async (req, res) => {
    try {
        const BlacklistedToken = require('../../models/BlacklistedToken')
        const authHeader = req.headers.authorization
        const refreshToken = authService.getRefreshTokenFromRequest(req)
        const userId = req.user?.id

        // Blacklist access token if present
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const accessToken = authHeader.substring(7)
            if (accessToken && userId) {
                try {
                    // Hash the token for storage
                    const crypto = require('crypto')
                    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex')

                    // Get token expiration from decoded token
                    const jwt = require('jsonwebtoken')
                    const decoded = jwt.decode(accessToken)
                    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default 7 days

                    await BlacklistedToken.blacklistToken(
                        accessToken,
                        tokenHash,
                        userId,
                        expiresAt,
                        'LOGOUT',
                        {
                            ipAddress: req.ip,
                            userAgent: req.headers['user-agent']
                        }
                    )
                } catch (error) {
                    logger.warn({ type: 'token_blacklist_error', error: error.message }, 'Failed to blacklist access token')
                }
            }
        }

        // Revoke refresh token
        if (refreshToken) {
            try {
                const { tokenDoc } = await authService.validateRefreshToken(refreshToken)
                await authService.revokeUserSessions(tokenDoc.userId)
            } catch (error) {
                logger.warn({ type: 'refresh_token_revoke_error', error: error.message }, 'Failed to revoke refresh token')
            }
        }

        authService.clearAuthSession(res)

        return res.status(HTTP_STATUS.OK).json(responseFormatter.success(null, 'Logged out successfully'))
    } catch (error) {
        logger.error({ type: 'auth_logout_error', error: error.message }, 'Logout encountered an issue')
        authService.clearAuthSession(res)
        return res.status(HTTP_STATUS.OK).json(responseFormatter.success(null, 'Logged out'))
    }
}

const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body
        const user = await authService.findUserByEmail(email)

        if (!user) {
            return res.status(HTTP_STATUS.OK).json(responseFormatter.success(null, 'If your account exists, you will receive password reset instructions shortly.'))
        }

        const resetTokenDoc = await generatePasswordResetToken(
            user._id,
            user.email,
            req.ip,
            req.headers['user-agent']
        )

        // Build reset URL
        const resetToken = resetTokenDoc.plainToken || resetTokenDoc.token
        const resetUrl = `${process.env.FRONTEND_URL || process.env.API_BASE_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`

        // Send password reset email
        try {
            await emailService.sendPasswordReset({
                to: user.email,
                userName: `${user.firstname} ${user.lastname}`,
                resetUrl,
                expiresIn: '10 minutes'
            })
        } catch (emailError) {
            logger.error({
                type: 'password_reset_email_error',
                error: emailError.message,
                userId: user._id
            }, 'Failed to send password reset email')
            // Don't fail the request if email fails
        }

        await auditLogService.logSecurityAction(user._id, 'PASSWORD_RESET_REQUESTED', {
            ...getRequestContext(req),
            tokenId: resetTokenDoc._id
        }, true, req)

        const responsePayload = {
            message: 'Password reset requested successfully'
        }

        if (process.env.NODE_ENV !== 'production') {
            // Use plainToken property which contains the plain token (token field contains hash)
            responsePayload.resetToken = resetToken
        }

        return res.status(HTTP_STATUS.OK).json(responseFormatter.success(responsePayload, 'Password reset request successful'))
    } catch (error) {
        logger.error({ type: 'auth_password_reset_request_error', error: error.message }, 'Password reset request failed')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(responseFormatter.error('Unable to process password reset request', HTTP_STATUS.INTERNAL_SERVER_ERROR))
    }
}

const resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body

        const tokenDoc = await Token.useToken(resetToken, TOKEN_TYPES.PASSWORD_RESET)

        const user = await User.findById(tokenDoc.userId)

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(responseFormatter.notFound('User'))
        }

        const hashedPassword = await authService.hashPassword(newPassword)
        user.password = hashedPassword
        await user.save()

        await authService.markPasswordReset(user._id)
        await authService.revokeUserSessions(user._id)

        await auditLogService.logSecurityAction(user._id, 'PASSWORD_RESET_COMPLETED', getRequestContext(req), true, req)

        return res.status(HTTP_STATUS.OK).json(responseFormatter.success(null, 'Password reset successfully'))
    } catch (error) {
        logger.error({ type: 'auth_password_reset_error', error: error.message }, 'Password reset failed')
        return res.status(HTTP_STATUS.BAD_REQUEST).json(responseFormatter.error(error.message || 'Invalid or expired reset token', HTTP_STATUS.BAD_REQUEST))
    }
}

module.exports = {
    register,
    login,
    refreshTokens,
    logout,
    requestPasswordReset,
    resetPassword
}


