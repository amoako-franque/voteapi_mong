const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const Token = require('../models/Token')
const { TOKEN_TYPES } = Token
const winstonLogger = require('./winstonLogger')

const ACCESS_TOKEN_COOKIE_NAME = process.env.ACCESS_TOKEN_COOKIE_NAME || 'voteapi_access_token'
const REFRESH_TOKEN_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || 'voteapi_refresh_token'
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'

// JWT Configuration - MUST be set in environment variables for production
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production'
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '7d'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

const JWT_ISSUER = process.env.JWT_ISSUER || 'voteapi'
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'voteapi_clients'

// Warn if using default secrets
if (!process.env.JWT_ACCESS_SECRET) {
    winstonLogger.warn({
        type: 'configuration_warning',
        config: 'JWT_ACCESS_SECRET',
        message: 'Using default development secret'
    }, 'JWT_ACCESS_SECRET not set. Using insecure default. Set JWT_ACCESS_SECRET in production!')
}



/**
 * Parse time string (e.g., "7d", "30d", "15m", "1h") to milliseconds
 * @param {string} timeString - Time string like "7d", "30d", "15m", "1h"
 * @returns {number} Milliseconds
 */
const parseTimeToMs = (timeString) => {
    if (!timeString || typeof timeString !== 'string') {
        return null
    }

    const match = timeString.match(/^(\d+)([smhd])$/i)
    if (!match) {
        return null
    }

    const value = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()

    const multipliers = {
        s: 1000,           // seconds
        m: 60 * 1000,      // minutes
        h: 60 * 60 * 1000, // hours
        d: 24 * 60 * 60 * 1000 // days
    }

    return value * multipliers[unit]
}

const ACCESS_TOKEN_TTL_MS = (() => {
    const parsed = parseTimeToMs(JWT_ACCESS_EXPIRES_IN)
    if (parsed !== null) {
        return parsed
    }

    const envValue = process.env.ACCESS_TOKEN_TTL_MS
    if (envValue) {
        const numValue = Number(envValue)
        if (!isNaN(numValue) && numValue > 0) {
            return numValue
        }
    }

    return 7 * 24 * 60 * 60 * 1000
})()

const REFRESH_TOKEN_TTL_MS = (() => {
    const parsed = parseTimeToMs(JWT_REFRESH_EXPIRES_IN)
    if (parsed !== null) {
        return parsed
    }

    // Fallback default: 30 days (matching JWT_REFRESH_EXPIRES_IN default)
    return 30 * 24 * 60 * 60 * 1000
})()

// Token hashing secret for refresh tokens stored in database
const TOKEN_HASH_SECRET = process.env.TOKEN_HASH_SECRET || 'dev-hash-secret-change-in-production'

if (!process.env.TOKEN_HASH_SECRET) {
    winstonLogger.warn({
        type: 'configuration_warning',
        config: 'TOKEN_HASH_SECRET',
        message: 'Using default development secret'
    }, 'TOKEN_HASH_SECRET not set. Using insecure default. Set TOKEN_HASH_SECRET in production!')
}

/**
 * Hash a value using HMAC-SHA256
 * Used for hashing refresh tokens before storing in database
 */
const getHash = (value) => {
    return crypto.createHmac('sha256', TOKEN_HASH_SECRET).update(value).digest('hex')
}

const normalizeCookieOptions = (overrides = {}) => {
    const baseOptions = {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: process.env.COOKIE_SAME_SITE || 'strict',
        domain: COOKIE_DOMAIN,
        path: '/',
        ...overrides
    }

    if (!baseOptions.domain) {
        delete baseOptions.domain
    }

    return baseOptions
}

/**
 * Generate JWT access token
 * @param {Object} user - User document with _id, role, permissions, verified
 * @param {Object} customPayload - Additional payload data (optional)
 * @returns {string} Signed JWT access token
 */
const generateAccessToken = (user, customPayload = {}) => {
    if (!user || !user._id) {
        throw new Error('Invalid user payload supplied to generateAccessToken')
    }

    const payload = {
        userId: user._id.toString(),
        role: user.role,
        permissions: user.permissions,
        verified: user.verified,
        ...customPayload
    }

    try {
        return jwt.sign(payload, JWT_ACCESS_SECRET, {
            expiresIn: JWT_ACCESS_EXPIRES_IN,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        })
    } catch (error) {
        winstonLogger.error({
            type: 'token_generation_error',
            error: error.message
        }, 'Failed to generate access token')
        throw new Error(`Failed to generate access token: ${ error.message }`)
    }
}

/**
 * Generate refresh token and store hashed version in database
 * Implements token rotation: deletes any existing refresh token for the user before creating a new one
 * This ensures only one active refresh token exists per user at any time
 * @param {string} userId - User ID
 * @param {Object} context - Context information (ipAddress, userAgent, etc.)
 * @returns {Promise<Object>} Object with token (plain), expiresAt, tokenId
 */
const generateRefreshToken = async (userId, context = {}) => {
    // Token rotation: Delete any existing refresh tokens for this user
    // This ensures only one refresh token exists per user at any time
    const deletedCount = await Token.deleteMany({
        userId,
        type: TOKEN_TYPES.REFRESH_TOKEN,
        used: false
    })

    if (deletedCount.deletedCount > 0) {
        winstonLogger.info({
            type: 'refresh_token_rotated',
            userId,
            deletedTokens: deletedCount.deletedCount,
            reason: 'New refresh token generated - old token invalidated'
        }, `Rotated refresh token for user ${ userId }. Deleted ${ deletedCount.deletedCount } existing token(s)`)
    }

    const refreshToken = crypto.randomBytes(64).toString('hex')
    const hashedToken = getHash(refreshToken)

    let expiresAt
    if (context.expiresAt instanceof Date && !isNaN(context.expiresAt.getTime())) {
        expiresAt = context.expiresAt
    } else if (context.expiresInMs !== undefined && context.expiresInMs !== null) {
        const expiresInMs = Number(context.expiresInMs)
        if (isNaN(expiresInMs) || expiresInMs <= 0) {
            throw new Error(`Invalid expiresInMs value: ${ context.expiresInMs }. Must be a positive number in milliseconds.`)
        }
        expiresAt = new Date(Date.now() + expiresInMs)
    } else {
        expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    }

    if (isNaN(expiresAt.getTime())) {
        throw new Error(`Invalid expiration date: ${ expiresAt }`)
    }

    const tokenDoc = new Token({
        userId,
        type: TOKEN_TYPES.REFRESH_TOKEN,
        purpose: 'User session refresh token',
        expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: context.metadata || {},
        associatedData: {
            fingerprint: context.deviceFingerprint,
            ...context.associatedData
        },
        maxAttempts: 1,
        token: hashedToken
    })

    await tokenDoc.save()

    winstonLogger.info({
        type: 'refresh_token_generated',
        userId,
        tokenId: tokenDoc._id,
        expiresAt: tokenDoc.expiresAt
    }, `Generated new refresh token for user ${ userId }`)

    return {
        token: refreshToken,
        expiresAt: tokenDoc.expiresAt,
        tokenId: tokenDoc._id
    }
}

const verifyAccessToken = async (accessToken) => {
    if (!accessToken) {
        throw new Error('Access token is required')
    }

    try {
        // Verify with same secret, issuer, and audience used during signing
        const decoded = jwt.verify(accessToken, JWT_ACCESS_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        })

        return decoded
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            throw new Error(`Invalid access token: ${ error.message }`)
        }
        if (error.name === 'TokenExpiredError') {
            throw new Error('Access token has expired')
        }
        if (error.name === 'NotBeforeError') {
            throw new Error('Access token is not active yet')
        }
        throw error
    }
}

const verifyRefreshToken = async (refreshToken, userId = null) => {
    if (!refreshToken) {
        throw new Error('Refresh token is required')
    }

    const hashedToken = getHash(refreshToken)

    const query = {
        token: hashedToken,
        type: TOKEN_TYPES.REFRESH_TOKEN,
        used: false
    }

    if (userId) {
        query.userId = userId
    }

    const tokenDoc = await Token.findOne(query)

    if (!tokenDoc) {
        throw new Error('Invalid refresh token')
    }

    if (tokenDoc.expiresAt < new Date()) {
        tokenDoc.used = true
        tokenDoc.usedAt = new Date()
        await tokenDoc.save()
        throw new Error('Refresh token has expired')
    }

    return tokenDoc
}

const invalidateRefreshToken = async (tokenDoc) => {
    if (!tokenDoc) {
        return
    }

    tokenDoc.used = true
    tokenDoc.usedAt = new Date()
    await tokenDoc.save()
}

const invalidateUserRefreshTokens = async (userId) => {
    await Token.updateMany({
        userId,
        type: TOKEN_TYPES.REFRESH_TOKEN,
        used: false,
        expiresAt: { $gt: new Date() }
    }, {
        $set: {
            used: true,
            usedAt: new Date()
        }
    })
}

const setAuthCookies = (res, tokens) => {
    const {
        accessToken,
        refreshToken,
        refreshTokenExpiresAt,
        accessTokenTtlMs = ACCESS_TOKEN_TTL_MS
    } = tokens

    if (!res || typeof res.cookie !== 'function') {
        throw new Error('Response object with cookie method is required to set cookies')
    }

    if (accessToken) {
        res.cookie(
            ACCESS_TOKEN_COOKIE_NAME,
            accessToken,
            normalizeCookieOptions({
                maxAge: accessTokenTtlMs
            })
        )
    }

    if (refreshToken) {
        const refreshMaxAge = refreshTokenExpiresAt
            ? Math.max(0, refreshTokenExpiresAt.getTime() - Date.now())
            : REFRESH_TOKEN_TTL_MS

        res.cookie(
            REFRESH_TOKEN_COOKIE_NAME,
            refreshToken,
            normalizeCookieOptions({
                maxAge: refreshMaxAge
            })
        )
    }
}

const clearAuthCookies = (res) => {
    if (!res || typeof res.clearCookie !== 'function') {
        return
    }

    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, normalizeCookieOptions({}))
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, normalizeCookieOptions({}))
}

const getRefreshTokenFromRequest = (req) => {
    if (!req) {
        return null
    }

    if (req.cookies && req.cookies[REFRESH_TOKEN_COOKIE_NAME]) {
        return req.cookies[REFRESH_TOKEN_COOKIE_NAME]
    }

    if (req.body && req.body.refreshToken) {
        return req.body.refreshToken
    }

    if (req.headers['x-refresh-token']) {
        return req.headers['x-refresh-token']
    }

    return null
}

/**
 * Helper function to create and store token in database
 * Handles token generation, hashing, expiration, and invalidation of existing tokens
 */
const createAndStoreToken = async (tokenData) => {
    const {
        userId,
        type,
        purpose,
        expiresAt: providedExpiresAt,
        ipAddress,
        userAgent,
        metadata = {},
        associatedData = {},
        maxAttempts = 5,
        token: providedToken = null
    } = tokenData

    let expiresAt
    if (providedExpiresAt instanceof Date && !isNaN(providedExpiresAt.getTime())) {
        expiresAt = providedExpiresAt
    } else {
        throw new Error(`Invalid expiresAt value: ${ providedExpiresAt }. Must be a valid Date object.`)
    }

    if (type !== TOKEN_TYPES.REFRESH_TOKEN) {
        const existingToken = await Token.findOne({
            userId,
            type,
            used: false,
            expiresAt: { $gt: new Date() }
        })

        if (existingToken) {
            existingToken.used = true
            existingToken.usedAt = new Date()
            await existingToken.save()
        }
    }


    const token = new Token({
        userId,
        type,
        purpose,
        expiresAt,
        ipAddress,
        userAgent,
        metadata,
        associatedData,
        maxAttempts,
        token: providedToken
    })

    await token.save()

    if (token._plainToken) {
        token.plainToken = token._plainToken
    }

    return token
}

/**
 * Generate email verification token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string|null} ipAddress - IP address
 * @param {string|null} userAgent - User agent
 * @returns {Promise<Object>} Token document with plainToken property
 */
const generateEmailVerificationToken = async (userId, email, ipAddress = null, userAgent = null) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    return await createAndStoreToken({
        userId,
        type: TOKEN_TYPES.EMAIL_VERIFICATION,
        purpose: `Email verification for ${ email }`,
        expiresAt,
        ipAddress,
        userAgent,
        metadata: { email }
    })
}

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string|null} ipAddress - IP address
 * @param {string|null} userAgent - User agent
 * @returns {Promise<Object>} Token document with plainToken property
 */
const generatePasswordResetToken = async (userId, email, ipAddress = null, userAgent = null) => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    return await createAndStoreToken({
        userId,
        type: TOKEN_TYPES.PASSWORD_RESET,
        purpose: `Password reset for ${ email }`,
        expiresAt,
        ipAddress,
        userAgent,
        metadata: { email },
        maxAttempts: 3
    })
}

/**
 * Generate phone verification token
 * @param {string} userId - User ID
 * @param {string} phoneNumber - Phone number
 * @param {string|null} ipAddress - IP address
 * @param {string|null} userAgent - User agent
 * @returns {Promise<Object>} Token document with plainToken property
 */
const generatePhoneVerificationToken = async (userId, phoneNumber, ipAddress = null, userAgent = null) => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    return await createAndStoreToken({
        userId,
        type: TOKEN_TYPES.PHONE_VERIFICATION,
        purpose: `Phone verification for ${ phoneNumber }`,
        expiresAt,
        ipAddress,
        userAgent,
        metadata: { phoneNumber },
        maxAttempts: 3
    })
}

/**
 * Generate two-factor authentication token
 * @param {string} userId - User ID
 * @param {string} method - 2FA method
 * @param {string|null} ipAddress - IP address
 * @param {string|null} userAgent - User agent
 * @returns {Promise<Object>} Token document with plainToken property
 */
const generateTwoFactorAuthToken = async (userId, method, ipAddress = null, userAgent = null) => {
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    return await createAndStoreToken({
        userId,
        type: TOKEN_TYPES.TWO_FACTOR_AUTH,
        purpose: `Two-factor authentication via ${ method }`,
        expiresAt,
        ipAddress,
        userAgent,
        metadata: { method },
        maxAttempts: 3
    })
}

// Export ACCESS_TOKEN_TTL_MS for use in other modules
const getAccessTokenTtlMs = () => ACCESS_TOKEN_TTL_MS

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateEmailVerificationToken,
    generatePasswordResetToken,
    generatePhoneVerificationToken,
    generateTwoFactorAuthToken,
    verifyAccessToken,
    verifyRefreshToken,
    invalidateRefreshToken,
    invalidateUserRefreshTokens,
    setAuthCookies,
    clearAuthCookies,
    getRefreshTokenFromRequest,
    getAccessTokenTtlMs
}


