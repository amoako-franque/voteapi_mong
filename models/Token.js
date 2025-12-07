const mongoose = require('mongoose')
const crypto = require('crypto')

// Token type constants - use these when generating tokens to avoid typos
const TOKEN_TYPES = {
    EMAIL_VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
    EMAIL_CHANGE_VERIFICATION: 'email_change_verification',
    PHONE_VERIFICATION: 'phone_verification',
    TWO_FACTOR_AUTH: 'two_factor_auth',
    ACCOUNT_ACTIVATION: 'account_activation',
    PASSWORD_CHANGE_VERIFICATION: 'password_change_verification',
    ADMIN_INVITATION: 'admin_invitation',
    VOTER_REGISTRATION_VERIFICATION: 'voter_registration_verification',
    REFRESH_TOKEN: 'refresh_token'
}

const tokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: Object.values(TOKEN_TYPES),
        required: true
    },
    purpose: {
        type: String,
        required: true,
        description: 'Human-readable description of token purpose'
    },
    expiresAt: {
        type: Date,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    usedAt: {
        type: Date,
        default: null
    },
    attempts: {
        type: Number,
        default: 0,
        max: 5
    },
    maxAttempts: {
        type: Number,
        default: 5
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    associatedData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'tokens'
})

// Indexes for performance and queries
tokenSchema.index({ userId: 1 })
tokenSchema.index({ type: 1 })
tokenSchema.index({ used: 1 })
tokenSchema.index({ ipAddress: 1 })
tokenSchema.index({ userId: 1, type: 1, used: 1 })
tokenSchema.index({ userId: 1, expiresAt: 1 })

// TTL index to automatically remove expired tokens from database
// MongoDB will automatically delete documents when expiresAt is in the past
// expireAfterSeconds: 0 means delete immediately when expiresAt < current time
// This ensures automatic cleanup without manual intervention
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Helper function to hash tokens consistently
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

// Pre-save middleware to generate and hash tokens consistently
// Best practice: Always hash tokens before storing for security
tokenSchema.pre('save', function (next) {
    // If token is not provided, generate a new one
    if (!this.token) {
        // Generate a random token (64 bytes = 128 hex chars for maximum entropy)
        const plainToken = crypto.randomBytes(64).toString('hex')
        // Store plain token temporarily so it can be returned to caller
        this._plainToken = plainToken
        // Hash it before storing (best practice: never store plain tokens)
        this.token = hashToken(plainToken)
    } else {
        // Token was provided - check if it needs hashing
        // SHA-256 hash = 32 bytes = 64 hex characters
        // Plain token from generateRefreshToken = 64 bytes = 128 hex characters
        // Plain token from auto-generation = 64 bytes = 128 hex characters
        const isHexString = /^[a-f0-9]+$/i.test(this.token)

        if (this.token.length === 128 && isHexString) {
            // This is a plain token (128 hex chars = 64 bytes), hash it
            this._plainToken = this.token
            this.token = hashToken(this.token)
        } else if (this.token.length === 64 && isHexString) {
            // This is already a hashed token (64 hex chars = 32 bytes = SHA-256)
            // No plain token to return, use as-is
            // This is the case for refresh tokens from generateRefreshToken
        }
        // If token doesn't match expected patterns (not hex, different length),
        // assume it's already processed or in a custom format
    }
    next()
})

// Instance method to check if token is expired
tokenSchema.methods.isExpired = function () {
    return this.expiresAt < new Date()
}

// Instance method to check if token is valid (not expired, not used, within attempt limit)
tokenSchema.methods.isValid = function () {
    return !this.isExpired() && !this.used && this.attempts < this.maxAttempts
}

// Instance method to mark token as used
// Note: Refresh tokens cannot be marked as used - they are invalidated via invalidateRefreshToken
tokenSchema.methods.markAsUsed = function () {
    if (this.type === TOKEN_TYPES.REFRESH_TOKEN) {
        throw new Error('Refresh tokens cannot be marked as used. Use invalidateRefreshToken instead.')
    }
    this.used = true
    this.usedAt = new Date()
    return this.save()
}

tokenSchema.methods.incrementAttempts = function () {
    this.attempts += 1
    return this.save()
}


tokenSchema.statics.verifyToken = async function (tokenString, type, userId = null) {
    try {
        if (!tokenString) {
            throw new Error('Token string is required')
        }

        // Hash the input token to compare with stored hash
        const hashedToken = hashToken(tokenString)

        const query = { token: hashedToken, type }
        if (userId) {
            query.userId = userId
        }

        const token = await this.findOne(query)

        if (!token) {
            throw new Error('Token not found')
        }

        if (token.isExpired()) {
            throw new Error('Token has expired')
        }

        if (token.used) {
            throw new Error('Token has already been used')
        }

        if (token.attempts >= token.maxAttempts) {
            throw new Error('Maximum verification attempts exceeded')
        }

        return token
    } catch (error) {
        throw new Error(`Token verification failed: ${ error.message }`)
    }
}

tokenSchema.statics.useToken = async function (tokenString, type, userId = null) {
    try {
        if (type === TOKEN_TYPES.REFRESH_TOKEN) {
            throw new Error('Refresh tokens cannot be marked as used. Use invalidateRefreshToken instead.')
        }
        const token = await this.verifyToken(tokenString, type, userId)
        await token.markAsUsed()
        return token
    } catch (error) {
        throw new Error(`Failed to use token: ${ error.message }`)
    }
}

tokenSchema.statics.getUserActiveTokens = async function (userId, type = null) {
    try {
        const query = {
            userId,
            used: false,
            expiresAt: { $gt: new Date() }
        }

        if (type) {
            query.type = type
        }

        return await this.find(query).sort({ createdAt: -1 })
    } catch (error) {
        throw new Error(`Failed to get user active tokens: ${ error.message }`)
    }
}

tokenSchema.statics.cleanExpiredTokens = async function () {
    try {
        const result = await this.deleteMany({
            expiresAt: { $lt: new Date() }
        })

        return {
            deletedCount: result.deletedCount,
            timestamp: new Date()
        }
    } catch (error) {
        throw new Error(`Failed to clean expired tokens: ${ error.message }`)
    }
}

tokenSchema.statics.cleanUsedTokens = async function (olderThanDays = 7) {
    try {
        const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000))

        const result = await this.deleteMany({
            used: true,
            usedAt: { $lt: cutoffDate }
        })

        return {
            deletedCount: result.deletedCount,
            timestamp: new Date()
        }
    } catch (error) {
        throw new Error(`Failed to clean used tokens: ${ error.message }`)
    }
}

tokenSchema.statics.getTokenStats = async function (userId = null) {
    try {
        const matchStage = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}

        const stats = await this.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: 1 },
                    used: { $sum: { $cond: ['$used', 1, 0] } },
                    expired: { $sum: { $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0] } },
                    active: { $sum: { $cond: [{ $and: ['$used', { $gt: ['$expiresAt', new Date()] }] }, 1, 0] } }
                }
            }
        ])

        const totalTokens = await this.countDocuments(matchStage)
        const activeTokens = await this.countDocuments({
            ...matchStage,
            used: false,
            expiresAt: { $gt: new Date() }
        })

        return {
            totalTokens,
            activeTokens,
            byType: stats,
            timestamp: new Date()
        }
    } catch (error) {
        throw new Error(`Failed to get token statistics: ${ error.message }`)
    }
}

tokenSchema.statics.invalidateUserTokens = async function (userId, type = null) {
    try {
        const query = {
            userId,
            used: false,
            expiresAt: { $gt: new Date() }
        }

        if (type) {
            query.type = type
        }

        const result = await this.updateMany(query, {
            $set: {
                used: true,
                usedAt: new Date()
            }
        })

        return {
            modifiedCount: result.modifiedCount,
            timestamp: new Date()
        }
    } catch (error) {
        throw new Error(`Failed to invalidate user tokens: ${ error.message }`)
    }
}


const token = mongoose.model('Token', tokenSchema)

// Export both the model and token types constant
token.TOKEN_TYPES = TOKEN_TYPES

module.exports = token
