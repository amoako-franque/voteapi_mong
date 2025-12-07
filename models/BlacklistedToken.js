const mongoose = require('mongoose')

const blacklistedTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tokenHash: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    reason: {
        type: String,
        enum: ['LOGOUT', 'PASSWORD_CHANGED', 'ACCOUNT_SUSPENDED', 'SECURITY_REVOKE', 'ADMIN_REVOKE'],
        default: 'LOGOUT'
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // Auto-delete expired tokens
    },
    blacklistedAt: {
        type: Date,
        default: Date.now
    },
    metadata: {
        ipAddress: String,
        userAgent: String
    }
}, {
    timestamps: true,
    collection: 'blacklisted_tokens'
})

// Index for efficient lookups
blacklistedTokenSchema.index({ tokenHash: 1, expiresAt: 1 })
blacklistedTokenSchema.index({ userId: 1, blacklistedAt: -1 })

// Static method to check if token is blacklisted
blacklistedTokenSchema.statics.isBlacklisted = async function (tokenHash) {
    try {
        const blacklisted = await this.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() }
        })
        return !!blacklisted
    } catch (error) {
        return false
    }
}

// Static method to blacklist a token
blacklistedTokenSchema.statics.blacklistToken = async function (token, tokenHash, userId, expiresAt, reason = 'LOGOUT', metadata = {}) {
    try {
        const blacklistedToken = await this.create({
            token,
            tokenHash,
            userId,
            expiresAt,
            reason,
            metadata
        })
        return blacklistedToken
    } catch (error) {
        // If token already exists, return existing one
        if (error.code === 11000) {
            return await this.findOne({ tokenHash })
        }
        throw error
    }
}

// Static method to get all blacklisted tokens for a user
blacklistedTokenSchema.statics.getUserBlacklistedTokens = async function (userId) {
    return await this.find({
        userId,
        expiresAt: { $gt: new Date() }
    }).sort({ blacklistedAt: -1 })
}

// Static method to clear expired tokens (cleanup)
blacklistedTokenSchema.statics.clearExpired = async function () {
    const result = await this.deleteMany({
        expiresAt: { $lt: new Date() }
    })
    return result.deletedCount
}

const BlacklistedToken = mongoose.model('BlacklistedToken', blacklistedTokenSchema)

module.exports = BlacklistedToken

