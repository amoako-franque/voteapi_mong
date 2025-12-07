const mongoose = require('mongoose')

const voteSchema = new mongoose.Schema({
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    positionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Position',
        required: true
    },
    candidateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidate',
        required: true
    },
    voterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterRegistry',
        required: true
    },
    // Security integration
    secretCodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterSecretCode',
        required: true
    },
    voterElectionAccessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterElectionAccess',
        required: true
    },
    // Voting session information (merged from VotingSession)
    sessionToken: {
        type: String,
        required: true,
        unique: true
    },
    voterIdNumber: {
        type: String,
        required: true
    },
    clientInfo: {
        type: mongoose.Schema.Types.Mixed
    },
    deviceFingerprint: {
        type: String
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    sessionExpiresAt: {
        type: Date
    },
    isSessionCompleted: {
        type: Boolean,
        default: false
    },
    sessionStartedAt: {
        type: Date,
        default: Date.now
    },
    // Vote security and verification
    voteHash: {
        type: String,
        required: true,
        unique: true
    },
    receiptHash: {
        type: String
    },
    verified: {
        type: Boolean,
        default: false
    },
    verificationMethod: {
        type: String,
        enum: ['AUTOMATIC', 'MANUAL', 'ADMIN_VERIFIED'],
        default: 'AUTOMATIC'
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: {
        type: Date
    },
    // Vote privacy and anonymity
    isAnonymous: {
        type: Boolean,
        default: false
    },
    encryptedBallot: {
        type: String
    },
    serverSalt: {
        type: String
    },
    ballotSecrecy: {
        type: Boolean,
        default: true
    },
    // Vote details and preferences
    voteType: {
        type: String,
        enum: ['FIRST_CHOICE', 'SECOND_CHOICE', 'THIRD_CHOICE', 'APPROVAL', 'WRITE_IN'],
        default: 'FIRST_CHOICE'
    },
    voteWeight: {
        type: Number,
        default: 1,
        min: 0,
        max: 1
    },
    isAbstention: {
        type: Boolean,
        default: false
    },
    abstentionReason: {
        type: String,
        trim: true
    },
    // Voting attempts and security
    votingAttempts: {
        type: Number,
        default: 1,
        min: 1
    },
    maxAttemptsReached: {
        type: Boolean,
        default: false
    },
    voteVerification: {
        type: Boolean,
        default: false
    },
    // Vote timing and location
    timestamp: {
        type: Date,
        default: Date.now
    },
    votingDuration: {
        type: Number // milliseconds spent voting
    },
    timezone: {
        type: String,
        default: 'Africa/Accra'
    },
    // Vote status and processing
    status: {
        type: String,
        enum: ['CAST', 'VERIFIED', 'COUNTED', 'DISPUTED', 'INVALID', 'RECOUNTED'],
        default: 'CAST'
    },
    processingStatus: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'PENDING'
    },
    // Dispute and audit information
    disputeStatus: {
        type: String,
        enum: ['NONE', 'PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
        default: 'NONE'
    },
    disputeReason: {
        type: String,
        trim: true
    },
    disputeSubmittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    disputeSubmittedAt: {
        type: Date
    },
    disputeResolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    disputeResolvedAt: {
        type: Date
    },
    disputeResolution: {
        type: String,
        trim: true
    },
    // Audit and tracking
    auditTrail: [{
        action: { type: String },
        timestamp: { type: Date },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        details: { type: mongoose.Schema.Types.Mixed }
    }],
    // Security and encryption fields
    encryptionKey: {
        type: String // Encrypted encryption key
    },
    digitalSignature: {
        type: String
    },
    voterPublicKey: {
        type: String
    },
    chainEntryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoteChain'
    },
    // Additional metadata
    metadata: {
        electionPhase: { type: String },
        positionOrder: { type: Number },
        candidateOrder: { type: Number },
        voteSequence: { type: Number },
        batchId: { type: String },
        // Security metadata
        encryptionMethod: { type: String, default: 'AES-256-GCM' },
        signatureAlgorithm: { type: String, default: 'ECDSA' },
        hashAlgorithm: { type: String, default: 'SHA-256' },
        securityLevel: { type: String, enum: ['STANDARD', 'HIGH', 'MAXIMUM'], default: 'STANDARD' }
    }
}, {
    timestamps: true,
    collection: 'votes'
})

// Indexes for performance
voteSchema.index({ electionId: 1 })
voteSchema.index({ positionId: 1 })
voteSchema.index({ candidateId: 1 })
voteSchema.index({ voterId: 1 })
voteSchema.index({ status: 1 })
voteSchema.index({ verified: 1 })
voteSchema.index({ disputeStatus: 1 })
// Security indexes
voteSchema.index({ secretCodeId: 1 })
voteSchema.index({ voterElectionAccessId: 1 })
voteSchema.index({ chainEntryId: 1 })
voteSchema.index({ digitalSignature: 1 })

// Compound unique index
voteSchema.index({ electionId: 1, voterId: 1, positionId: 1 }, { unique: true })
voteSchema.index({ electionId: 1, voterIdNumber: 1 })

// Virtual for vote validity
voteSchema.virtual('isValid').get(function () {
    return this.status === 'CAST' || this.status === 'VERIFIED' || this.status === 'COUNTED'
})

// Virtual for session status
voteSchema.virtual('sessionStatus').get(function () {
    const now = new Date()
    if (this.sessionExpiresAt && now > this.sessionExpiresAt) return 'EXPIRED'
    if (this.isSessionCompleted) return 'COMPLETED'
    return 'ACTIVE'
})

// Static methods
voteSchema.statics.findByElection = function (electionId) {
    return this.find({ electionId }).populate('candidateId positionId voterId')
}

voteSchema.statics.findByPosition = function (electionId, positionId) {
    return this.find({ electionId, positionId }).populate('candidateId voterId')
}

voteSchema.statics.findByVoter = function (electionId, voterId) {
    return this.find({ electionId, voterId }).populate('candidateId positionId')
}

voteSchema.statics.findVerifiedVotes = function (electionId) {
    return this.find({ electionId, verified: true, status: { $in: ['VERIFIED', 'COUNTED'] } })
}

voteSchema.statics.findDisputedVotes = function (electionId) {
    return this.find({ electionId, disputeStatus: { $ne: 'NONE' } })
}

voteSchema.statics.getVoteStatistics = function (electionId) {
    return this.aggregate([
        { $match: { electionId: mongoose.Types.ObjectId(electionId) } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ])
}

voteSchema.statics.getPositionVoteCounts = function (electionId, positionId) {
    return this.aggregate([
        { $match: { electionId: mongoose.Types.ObjectId(electionId), positionId: mongoose.Types.ObjectId(positionId) } },
        {
            $group: {
                _id: '$candidateId',
                totalVotes: { $sum: 1 },
                verifiedVotes: { $sum: { $cond: ['$verified', 1, 0] } }
            }
        }
    ])
}

// Instance methods
voteSchema.methods.verifyVote = function (verifiedBy, method = 'MANUAL') {
    this.verified = true
    this.verifiedBy = verifiedBy
    this.verifiedAt = new Date()
    this.verificationMethod = method
    this.status = 'VERIFIED'

    this.auditTrail.push({
        action: 'VOTE_VERIFIED',
        timestamp: new Date(),
        performedBy: verifiedBy,
        details: { method }
    })

    return this.save()
}

voteSchema.methods.markAsCounted = function (countedBy) {
    this.status = 'COUNTED'
    this.processingStatus = 'COMPLETED'

    this.auditTrail.push({
        action: 'VOTE_COUNTED',
        timestamp: new Date(),
        performedBy: countedBy,
        details: {}
    })

    return this.save()
}

voteSchema.methods.submitDispute = function (reason, submittedBy) {
    this.disputeStatus = 'PENDING'
    this.disputeReason = reason
    this.disputeSubmittedBy = submittedBy
    this.disputeSubmittedAt = new Date()

    this.auditTrail.push({
        action: 'DISPUTE_SUBMITTED',
        timestamp: new Date(),
        performedBy: submittedBy,
        details: { reason }
    })

    return this.save()
}

voteSchema.methods.resolveDispute = function (resolution, resolvedBy) {
    this.disputeStatus = 'RESOLVED'
    this.disputeResolution = resolution
    this.disputeResolvedBy = resolvedBy
    this.disputeResolvedAt = new Date()

    this.auditTrail.push({
        action: 'DISPUTE_RESOLVED',
        timestamp: new Date(),
        performedBy: resolvedBy,
        details: { resolution }
    })

    return this.save()
}

voteSchema.methods.invalidateVote = function (reason, invalidatedBy) {
    this.status = 'INVALID'
    this.processingStatus = 'FAILED'

    this.auditTrail.push({
        action: 'VOTE_INVALIDATED',
        timestamp: new Date(),
        performedBy: invalidatedBy,
        details: { reason }
    })

    return this.save()
}

voteSchema.methods.addAuditEntry = function (action, performedBy, details = {}) {
    this.auditTrail.push({
        action,
        timestamp: new Date(),
        performedBy,
        details
    })
    return this.save()
}

voteSchema.methods.getVoteSummary = function () {
    return {
        id: this._id,
        electionId: this.electionId,
        positionId: this.positionId,
        candidateId: this.candidateId,
        voterId: this.voterId,
        voteType: this.voteType,
        isAbstention: this.isAbstention,
        verified: this.verified,
        status: this.status,
        timestamp: this.timestamp,
        disputeStatus: this.disputeStatus
    }
}

voteSchema.methods.isSessionValid = function () {
    const now = new Date()
    return this.sessionExpiresAt && now <= this.sessionExpiresAt && !this.isSessionCompleted
}

voteSchema.methods.completeSession = function () {
    this.isSessionCompleted = true
    this.votingDuration = Date.now() - this.sessionStartedAt.getTime()
    return this.save()
}

// Pre-save middleware
voteSchema.pre('save', function (next) {
    // Ensure vote hash is unique
    if (this.isNew && !this.voteHash) {
        this.voteHash = this.generateVoteHash()
    }

    // Ensure session token is unique
    if (this.isNew && !this.sessionToken) {
        this.sessionToken = this.generateSessionToken()
    }

    // Ensure vote weight is within valid range
    if (this.voteWeight < 0) this.voteWeight = 0
    if (this.voteWeight > 1) this.voteWeight = 1

    // Ensure voting attempts don't exceed maximum
    if (this.votingAttempts > 3) {
        this.maxAttemptsReached = true
    }

    next()
})

// Helper methods
voteSchema.methods.generateVoteHash = function () {
    const crypto = require('crypto')
    const data = `${ this.electionId }-${ this.voterId }-${ this.positionId }-${ this.candidateId }-${ Date.now() }`
    return crypto.createHash('sha256').update(data).digest('hex')
}

voteSchema.methods.generateSessionToken = function () {
    const crypto = require('crypto')
    return crypto.randomBytes(32).toString('hex')
}

const vote = mongoose.model('Vote', voteSchema)

module.exports = vote
