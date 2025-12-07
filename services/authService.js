const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const User = require('../models/User')
const Token = require('../models/Token')
const { TOKEN_TYPES } = Token
const {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    invalidateRefreshToken,
    invalidateUserRefreshTokens,
    setAuthCookies,
    clearAuthCookies,
    getRefreshTokenFromRequest,
    getAccessTokenTtlMs
} = require('../utils/generateToken')

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12)


const preHashPassword = (password) => {
    return crypto.createHash('sha256').update(password, 'utf8').digest('hex')
}

const hashPassword = async (password) => {
    if (!password) {
        throw new Error('Password is required for hashing')
    }
    const preHashed = preHashPassword(password)
    return bcrypt.hash(preHashed, BCRYPT_SALT_ROUNDS)
}

const comparePassword = async (plainPassword, hashedPassword) => {
    if (!plainPassword || !hashedPassword) {
        return false
    }
    const preHashed = preHashPassword(plainPassword)
    return bcrypt.compare(preHashed, hashedPassword)
}

/**
 * Verify access token using verifyAccessToken from generateToken
 * This ensures issuer and audience validation matches the signing process
 */
const verifyToken = async (token) => {
    return verifyAccessToken(token)
}

const buildSafeUser = (userDoc) => {
    if (!userDoc) {
        return null
    }

    return {
        id: userDoc._id,
        email: userDoc.email,
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
        fullName: userDoc.fullName,
        role: userDoc.role,
        permissions: userDoc.permissions,
        verified: userDoc.verified,
        isActive: userDoc.isActive,
        lastLogin: userDoc.lastLogin,
        createdAt: userDoc.createdAt,
        updatedAt: userDoc.updatedAt
    }
}

const issueAuthTokens = async (userDoc, options = {}) => {
    const accessToken = generateAccessToken(userDoc, options.accessPayload)

    const refreshContext = {
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        deviceFingerprint: options.deviceFingerprint,
        metadata: options.metadata,
        associatedData: options.associatedData
    }

    const refreshTokenPayload = await generateRefreshToken(userDoc._id, refreshContext)

    const accessTokenTtlMs = getAccessTokenTtlMs()
    const accessTokenExpiresAt = new Date(Date.now() + accessTokenTtlMs)

    const refreshTokenExpiresAt = refreshTokenPayload.expiresAt instanceof Date
        ? refreshTokenPayload.expiresAt.toISOString()
        : refreshTokenPayload.expiresAt

    const response = {
        accessToken,
        refreshToken: refreshTokenPayload.token,
        expiresIn: {
            access: accessTokenExpiresAt.toISOString(),
            refresh: refreshTokenExpiresAt
        }
    }

    if (options.res) {
        setAuthCookies(options.res, {
            accessToken,
            refreshToken: refreshTokenPayload.token,
            refreshTokenExpiresAt: refreshTokenPayload.expiresAt,
            accessTokenTtlMs: accessTokenTtlMs
        })
    }

    return response
}

/**
 * Refresh authentication tokens with proper token rotation
 * 1. Verifies the incoming refresh token
 * 2. Invalidates the old refresh token
 * 3. Generates new access and refresh tokens
 * 4. The new refresh token generation automatically deletes any existing refresh tokens (one token per user)
 * @param {Object} userDoc - User document
 * @param {string} refreshTokenString - Incoming refresh token string
 * @param {Object} options - Options for token generation (res, ipAddress, userAgent, etc.)
 * @param {Object} existingTokenDoc - Optional pre-verified token document (to avoid double verification)
 * @returns {Promise<Object>} New access and refresh tokens
 */
const refreshAuthTokens = async (userDoc, refreshTokenString, options = {}, existingTokenDoc = null) => {
    // Verify the incoming refresh token
    const tokenDoc = existingTokenDoc || await verifyRefreshToken(refreshTokenString, userDoc._id)

    // Invalidate the old refresh token before generating new ones
    // This ensures the old token cannot be reused (token rotation security)
    await invalidateRefreshToken(tokenDoc)

    // Generate new tokens
    // Note: generateRefreshToken will automatically delete any existing refresh tokens for this user
    // This ensures only one refresh token exists per user at any time
    return issueAuthTokens(userDoc, options)
}

const revokeUserSessions = async (userId) => {
    await invalidateUserRefreshTokens(userId)
}

const clearAuthSession = (res) => {
    clearAuthCookies(res)
}

const findUserByEmail = async (email, includePassword = false) => {
    if (!email) {
        return null
    }

    const query = User.findOne({ email })
    if (includePassword) {
        query.select('+password')
    }

    return query
}

const markPasswordReset = async (userId) => {
    await Token.updateMany({
        userId,
        type: TOKEN_TYPES.PASSWORD_RESET,
        used: false,
        expiresAt: { $gt: new Date() }
    }, {
        $set: {
            used: true,
            usedAt: new Date()
        }
    })
}

const validateRefreshToken = async (refreshTokenString) => {
    const tokenDoc = await verifyRefreshToken(refreshTokenString)

    if (!tokenDoc) {
        throw new Error('Refresh token validation failed')
    }

    const userDoc = await User.findById(tokenDoc.userId)

    if (!userDoc) {
        await invalidateRefreshToken(tokenDoc)
        throw new Error('User associated with refresh token no longer exists')
    }

    if (!userDoc.isActive) {
        await invalidateRefreshToken(tokenDoc)
        throw new Error('User account is inactive')
    }

    return { tokenDoc, userDoc }
}

const authService = {
    hashPassword,
    comparePassword,
    verifyToken,
    issueAuthTokens,
    refreshAuthTokens,
    revokeUserSessions,
    clearAuthSession,
    findUserByEmail,
    markPasswordReset,
    validateRefreshToken,
    getRefreshTokenFromRequest,
    buildSafeUser
}

module.exports = authService


