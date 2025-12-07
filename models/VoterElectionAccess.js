const mongoose = require('mongoose')

const voterElectionAccessSchema = new mongoose.Schema({
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
    secretCodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterSecretCode',
        required: true
    },
    // Eligibility and access
    isEligible: {
        type: Boolean,
        default: true
    },
    eligibilityStatus: {
        type: String,
        enum: ['ELIGIBLE', 'INELIGIBLE', 'PENDING_VERIFICATION', 'SUSPENDED'],
        default: 'ELIGIBLE'
    },
    // Position management
    positionsEligible: [{
        positionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Position'
        },
        eligibilityReason: {
            type: String,
            trim: true
        },
        verifiedAt: {
            type: Date,
            default: Date.now
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    positionsVoted: [{
        positionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Position'
        },
        candidateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Candidate'
        },
        votedAt: {
            type: Date,
            default: Date.now
        },
        voteId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vote'
        }
    }],
    // Voting statistics
    totalVotesCast: {
        type: Number,
        default: 0,
        min: 0
    },
    totalEligiblePositions: {
        type: Number,
        default: 0,
        min: 0
    },
    votingProgress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    // Access control
    accessGrantedAt: {
        type: Date,
        default: Date.now
    },
    accessGrantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastVoteAt: {
        type: Date
    },
    lastAccessAt: {
        type: Date,
        default: Date.now
    },
    // Status and lifecycle
    status: {
        type: String,
        enum: ['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'],
        default: 'ACTIVE'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Suspension details
    suspendedAt: {
        type: Date
    },
    suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    suspensionReason: {
        type: String,
        trim: true
    },
    // Revocation details
    revokedAt: {
        type: Date
    },
    revokedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    revocationReason: {
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
        registrationMethod: { type: String, default: 'ADMIN' },
        verificationMethod: { type: String, default: 'MANUAL' },
        notes: { type: String, trim: true }
    }
}, {
    timestamps: true,
    collection: 'voter_election_access'
})

// Indexes for performance
voterElectionAccessSchema.index({ voterId: 1, electionId: 1 }, { unique: true })
voterElectionAccessSchema.index({ electionId: 1, isActive: 1 })
voterElectionAccessSchema.index({ electionId: 1, status: 1 })
voterElectionAccessSchema.index({ secretCodeId: 1 })
voterElectionAccessSchema.index({ accessGrantedBy: 1 })
voterElectionAccessSchema.index({ lastVoteAt: 1 })

// Virtual for completion status
voterElectionAccessSchema.virtual('isComplete').get(function () {
    return this.totalVotesCast >= this.totalEligiblePositions
})

// Virtual for remaining positions
voterElectionAccessSchema.virtual('remainingPositions').get(function () {
    return this.totalEligiblePositions - this.totalVotesCast
})

// Static methods
voterElectionAccessSchema.statics.findByVoterAndElection = function (voterId, electionId) {
    return this.findOne({ voterId, electionId })
}

voterElectionAccessSchema.statics.findActiveAccess = function (electionId) {
    return this.find({ electionId, isActive: true, status: 'ACTIVE' })
}

voterElectionAccessSchema.statics.findSuspendedAccess = function (electionId) {
    return this.find({ electionId, status: 'SUSPENDED' })
}

voterElectionAccessSchema.statics.getAccessStatistics = function (electionId) {
    return this.aggregate([
        { $match: { electionId: mongoose.Types.ObjectId(electionId) } },
        {
            $group: {
                _id: null,
                totalAccess: { $sum: 1 },
                activeAccess: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
                suspendedAccess: { $sum: { $cond: [{ $eq: ['$status', 'SUSPENDED'] }, 1, 0] } },
                revokedAccess: { $sum: { $cond: [{ $eq: ['$status', 'REVOKED'] }, 1, 0] } },
                totalVotesCast: { $sum: '$totalVotesCast' },
                avgVotingProgress: { $avg: '$votingProgress' }
            }
        }
    ])
}

// Instance methods
voterElectionAccessSchema.methods.addEligiblePosition = function (positionId, eligibilityReason, verifiedBy) {
    const existingPosition = this.positionsEligible.find(pos =>
        pos.positionId.toString() === positionId.toString()
    )

    if (!existingPosition) {
        this.positionsEligible.push({
            positionId,
            eligibilityReason,
            verifiedAt: new Date(),
            verifiedBy
        })
        this.totalEligiblePositions = this.positionsEligible.length
        this.updateVotingProgress()
    }

    return this.save()
}

voterElectionAccessSchema.methods.removeEligiblePosition = function (positionId) {
    this.positionsEligible = this.positionsEligible.filter(pos =>
        pos.positionId.toString() !== positionId.toString()
    )
    this.totalEligiblePositions = this.positionsEligible.length
    this.updateVotingProgress()
    return this.save()
}

voterElectionAccessSchema.methods.recordVote = function (positionId, candidateId, voteId) {
    // Check if already voted for this position
    const existingVote = this.positionsVoted.find(vote =>
        vote.positionId.toString() === positionId.toString()
    )

    if (!existingVote) {
        this.positionsVoted.push({
            positionId,
            candidateId,
            votedAt: new Date(),
            voteId
        })
        this.totalVotesCast = this.positionsVoted.length
        this.lastVoteAt = new Date()
        this.lastAccessAt = new Date()
        this.updateVotingProgress()
    }

    return this.save()
}

voterElectionAccessSchema.methods.hasVotedForPosition = function (positionId) {
    return this.positionsVoted.some(vote =>
        vote.positionId.toString() === positionId.toString()
    )
}

voterElectionAccessSchema.methods.canVoteForPosition = function (positionId) {
    if (!this.isActive || this.status !== 'ACTIVE') return false
    if (this.hasVotedForPosition(positionId)) return false

    return this.positionsEligible.some(pos =>
        pos.positionId.toString() === positionId.toString()
    )
}

voterElectionAccessSchema.methods.updateVotingProgress = function () {
    if (this.totalEligiblePositions > 0) {
        this.votingProgress = Math.round((this.totalVotesCast / this.totalEligiblePositions) * 100)
    } else {
        this.votingProgress = 0
    }
}

voterElectionAccessSchema.methods.suspendAccess = function (suspendedBy, reason) {
    this.status = 'SUSPENDED'
    this.isActive = false
    this.suspendedAt = new Date()
    this.suspendedBy = suspendedBy
    this.suspensionReason = reason
    return this.save()
}

voterElectionAccessSchema.methods.reactivateAccess = function (reactivatedBy) {
    this.status = 'ACTIVE'
    this.isActive = true
    this.suspendedAt = null
    this.suspendedBy = null
    this.suspensionReason = null
    return this.save()
}

voterElectionAccessSchema.methods.revokeAccess = function (revokedBy, reason) {
    this.status = 'REVOKED'
    this.isActive = false
    this.revokedAt = new Date()
    this.revokedBy = revokedBy
    this.revocationReason = reason
    return this.save()
}

voterElectionAccessSchema.methods.updateLastAccess = function () {
    this.lastAccessAt = new Date()
    return this.save()
}

voterElectionAccessSchema.methods.getAccessSummary = function () {
    return {
        id: this._id,
        voterId: this.voterId,
        electionId: this.electionId,
        status: this.status,
        isActive: this.isActive,
        totalEligiblePositions: this.totalEligiblePositions,
        totalVotesCast: this.totalVotesCast,
        votingProgress: this.votingProgress,
        isComplete: this.isComplete,
        remainingPositions: this.remainingPositions,
        lastVoteAt: this.lastVoteAt,
        lastAccessAt: this.lastAccessAt
    }
}

// Pre-save middleware
voterElectionAccessSchema.pre('save', function (next) {
    // Update voting progress
    this.updateVotingProgress()

    // Update last access time
    if (this.isModified() && !this.isModified('lastAccessAt')) {
        this.lastAccessAt = new Date()
    }

    next()
})

const voterElectionAccess = mongoose.model('VoterElectionAccess', voterElectionAccessSchema)

module.exports = voterElectionAccess
