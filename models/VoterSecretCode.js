const mongoose = require('mongoose')

const voterSecretCodeSchema = new mongoose.Schema({
    voterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterRegistry',
        required: true
    },
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    // Secret code information
    secretCode: {
        type: String,
        required: true,
        minlength: 6,
        maxlength: 6
    },
    codeHash: {
        type: String,
        required: true
    },
    salt: {
        type: String,
        required: true
    },
    // Code status and usage
    isActive: {
        type: Boolean,
        default: true
    },
    totalUses: {
        type: Number,
        default: 0,
        min: 0
    },
    lastUsedAt: {
        type: Date
    },
    // Position tracking
    positionsVoted: [{
        positionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Position'
        },
        votedAt: {
            type: Date,
            default: Date.now
        },
        candidateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Candidate'
        }
    }],
    // Security and attempts
    attempts: {
        type: Number,
        default: 0,
        min: 0,
        max: 3
    },
    lockedUntil: {
        type: Date
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    // Code generation details
    generatedAt: {
        type: Date,
        default: Date.now
    },
    generatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Deactivation details
    deactivatedAt: {
        type: Date
    },
    deactivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deactivationReason: {
        type: String,
        trim: true
    },
    // Security tracking
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    deviceFingerprint: {
        type: String
    },
    // Additional metadata
    metadata: {
        generationMethod: { type: String, default: 'AUTOMATIC' },
        emailSent: { type: Boolean, default: false },
        smsSent: { type: Boolean, default: false },
        deliveryStatus: { type: String, enum: ['PENDING', 'DELIVERED', 'FAILED'], default: 'PENDING' }
    }
}, {
    timestamps: true,
    collection: 'voter_secret_codes'
})

// Indexes for performance
voterSecretCodeSchema.index({ voterId: 1, electionId: 1 }, { unique: true })
voterSecretCodeSchema.index({ codeHash: 1 }, { unique: true })
voterSecretCodeSchema.index({ electionId: 1, isActive: 1 })
voterSecretCodeSchema.index({ generatedBy: 1 })
voterSecretCodeSchema.index({ isLocked: 1 })
voterSecretCodeSchema.index({ lastUsedAt: 1 })

// Virtual for code status
voterSecretCodeSchema.virtual('status').get(function () {
    if (!this.isActive) return 'DEACTIVATED'
    if (this.isLocked && this.lockedUntil && new Date() < this.lockedUntil) return 'LOCKED'
    if (this.isLocked && this.lockedUntil && new Date() >= this.lockedUntil) return 'UNLOCKED'
    return 'ACTIVE'
})

// Virtual for remaining attempts
voterSecretCodeSchema.virtual('remainingAttempts').get(function () {
    return Math.max(0, 3 - this.attempts)
})

// Static methods
voterSecretCodeSchema.statics.findByVoterAndElection = function (voterId, electionId) {
    return this.findOne({ voterId, electionId })
}

voterSecretCodeSchema.statics.findActiveCodes = function (electionId) {
    return this.find({ electionId, isActive: true, isLocked: false })
}

voterSecretCodeSchema.statics.findLockedCodes = function (electionId) {
    return this.find({ electionId, isLocked: true })
}

voterSecretCodeSchema.statics.getCodeStatistics = function (electionId) {
    return this.aggregate([
        { $match: { electionId: mongoose.Types.ObjectId(electionId) } },
        {
            $group: {
                _id: null,
                totalCodes: { $sum: 1 },
                activeCodes: { $sum: { $cond: ['$isActive', 1, 0] } },
                lockedCodes: { $sum: { $cond: ['$isLocked', 1, 0] } },
                totalUses: { $sum: '$totalUses' },
                avgUses: { $avg: '$totalUses' }
            }
        }
    ])
}

// Instance methods
voterSecretCodeSchema.methods.validateCode = function (inputCode) {
    const crypto = require('crypto')
    const inputHash = crypto.createHash('sha256').update(inputCode + this.salt).digest('hex')
    return inputHash === this.codeHash
}

voterSecretCodeSchema.methods.recordFailedAttempt = function () {
    this.attempts += 1

    if (this.attempts >= 3) {
        this.isLocked = true
        this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes lockout
    }

    return this.save()
}

voterSecretCodeSchema.methods.resetAttempts = function () {
    this.attempts = 0
    this.isLocked = false
    this.lockedUntil = null
    return this.save()
}

voterSecretCodeSchema.methods.recordSuccessfulUse = function (positionId, candidateId) {
    this.totalUses += 1
    this.lastUsedAt = new Date()
    this.attempts = 0 // Reset attempts on successful use
    this.isLocked = false
    this.lockedUntil = null

    // Add position to voted positions
    this.positionsVoted.push({
        positionId,
        candidateId,
        votedAt: new Date()
    })

    return this.save()
}

voterSecretCodeSchema.methods.hasVotedForPosition = function (positionId) {
    return this.positionsVoted.some(vote =>
        vote.positionId.toString() === positionId.toString()
    )
}

voterSecretCodeSchema.methods.deactivateCode = function (deactivatedBy, reason) {
    this.isActive = false
    this.deactivatedAt = new Date()
    this.deactivatedBy = deactivatedBy
    this.deactivationReason = reason
    return this.save()
}

voterSecretCodeSchema.methods.reactivateCode = function (reactivatedBy) {
    this.isActive = true
    this.deactivatedAt = null
    this.deactivatedBy = null
    this.deactivationReason = null
    this.attempts = 0
    this.isLocked = false
    this.lockedUntil = null
    return this.save()
}

voterSecretCodeSchema.methods.getUsageSummary = function () {
    return {
        id: this._id,
        voterId: this.voterId,
        electionId: this.electionId,
        isActive: this.isActive,
        totalUses: this.totalUses,
        lastUsedAt: this.lastUsedAt,
        positionsVoted: this.positionsVoted.length,
        attempts: this.attempts,
        isLocked: this.isLocked,
        status: this.status,
        generatedAt: this.generatedAt
    }
}

voterSecretCodeSchema.methods.canVoteForPosition = function (positionId) {
    if (!this.isActive || this.isLocked) return false
    return !this.hasVotedForPosition(positionId)
}

// Pre-save middleware
voterSecretCodeSchema.pre('save', function (next) {
    // Ensure code is uppercase
    if (this.secretCode) {
        this.secretCode = this.secretCode.toUpperCase()
    }

    // Auto-unlock if lockout period has expired
    if (this.isLocked && this.lockedUntil && new Date() >= this.lockedUntil) {
        this.isLocked = false
        this.lockedUntil = null
        this.attempts = 0
    }

    next()
})

const voterSecretCode = mongoose.model('VoterSecretCode', voterSecretCodeSchema)

module.exports = voterSecretCode
