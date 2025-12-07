const mongoose = require('mongoose')

const electionResultSchema = new mongoose.Schema({
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true,
        unique: true,
        index: true
    },
    electionTitle: {
        type: String,
        required: true
    },
    calculatedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    calculatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['PROVISIONAL', 'FINAL', 'CONTESTED', 'VERIFIED'],
        default: 'PROVISIONAL',
        required: true
    },
    totalPositions: {
        type: Number,
        required: true
    },
    totalVotes: {
        type: Number,
        default: 0
    },
    totalVoters: {
        type: Number,
        default: 0
    },
    turnoutPercentage: {
        type: Number,
        default: 0
    },
    positions: [{
        positionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Position',
            required: true
        },
        positionTitle: {
            type: String,
            required: true
        },
        totalVotes: {
            type: Number,
            default: 0
        },
        abstentionCount: {
            type: Number,
            default: 0
        },
        candidates: [{
            candidateId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Candidate',
                required: true
            },
            candidateName: {
                type: String,
                required: true
            },
            displayName: {
                type: String
            },
            voteCount: {
                type: Number,
                default: 0
            },
            percentage: {
                type: Number,
                default: 0
            },
            rank: {
                type: Number
            }
        }],
        winners: [{
            candidateId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Candidate'
            },
            candidateName: String,
            voteCount: Number,
            percentage: Number
        }],
        isTie: {
            type: Boolean,
            default: false
        },
        maxWinners: {
            type: Number,
            default: 1
        }
    }],
    verification: {
        verified: {
            type: Boolean,
            default: false
        },
        verifiedAt: Date,
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        verificationNotes: String
    },
    metadata: {
        calculationMethod: {
            type: String,
            default: 'STANDARD'
        },
        voteIntegrityCheck: {
            type: Boolean,
            default: false
        },
        duplicateVotesFound: {
            type: Number,
            default: 0
        },
        disputedVotes: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true,
    collection: 'election_results'
})

// Indexes
electionResultSchema.index({ electionId: 1, status: 1 })
electionResultSchema.index({ calculatedAt: -1 })
electionResultSchema.index({ status: 1 })

// Static method to get result for an election
electionResultSchema.statics.getElectionResult = async function (electionId, status = null) {
    const query = { electionId }
    if (status) {
        query.status = status
    }
    return await this.findOne(query).sort({ calculatedAt: -1 })
}

// Static method to get final result for an election
electionResultSchema.statics.getFinalResult = async function (electionId) {
    return await this.findOne({
        electionId,
        status: 'FINAL'
    }).sort({ calculatedAt: -1 })
}

// Static method to update result status
electionResultSchema.statics.updateStatus = async function (electionId, status, verifiedBy = null, notes = null) {
    const update = { status }
    if (verifiedBy) {
        update['verification.verified'] = true
        update['verification.verifiedAt'] = new Date()
        update['verification.verifiedBy'] = verifiedBy
    }
    if (notes) {
        update['verification.verificationNotes'] = notes
    }
    return await this.findOneAndUpdate(
        { electionId },
        { $set: update },
        { new: true }
    )
}

// Instance method to mark as final
electionResultSchema.methods.markAsFinal = async function (verifiedBy = null) {
    this.status = 'FINAL'
    if (verifiedBy) {
        this.verification.verified = true
        this.verification.verifiedAt = new Date()
        this.verification.verifiedBy = verifiedBy
    }
    return await this.save()
}

// Instance method to mark as contested
electionResultSchema.methods.markAsContested = async function (notes = null) {
    this.status = 'CONTESTED'
    if (notes) {
        this.verification.verificationNotes = notes
    }
    return await this.save()
}

const ElectionResult = mongoose.model('ElectionResult', electionResultSchema)

module.exports = ElectionResult

