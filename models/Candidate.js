const mongoose = require('mongoose')

const candidateSchema = new mongoose.Schema({
    voterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterRegistry',
        required: true
    },
    positionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Position',
        required: true
    },
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    // Candidate status and workflow
    status: {
        type: String,
        default: 'PENDING',
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'DISQUALIFIED', 'SUSPENDED']
    },
    nominationStatus: {
        type: String,
        enum: ['SELF_NOMINATED', 'NOMINATED_BY_OTHERS', 'RECOMMENDED', 'AUTO_NOMINATED'],
        default: 'SELF_NOMINATED'
    },
    // Basic information
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    displayName: {
        type: String,
        trim: true
    },
    // Campaign content
    manifesto: {
        type: String,
        maxLength: [5000, "Manifesto cannot exceed 5000 characters"],
        trim: true
    },
    campaignSlogan: {
        type: String,
        maxLength: [200, "Campaign slogan cannot exceed 200 characters"],
        trim: true
    },
    shortBio: {
        type: String,
        maxLength: [500, "Short bio cannot exceed 500 characters"],
        trim: true
    },
    // Media content
    profileImage: {
        url: {
            type: String
        },
        storageType: {
            type: String,
            enum: ['LOCAL', 'S3', 'CLOUDINARY'],
            default: 'LOCAL'
        },
        uniqueId: {
            type: String // Unique identifier for the image (for deletion)
        },
        // S3 specific
        s3Key: {
            type: String // S3 object key for deletion
        },
        // Cloudinary specific
        cloudinaryPublicId: {
            type: String // Cloudinary public ID for deletion
        },
        // Image metadata
        width: {
            type: Number
        },
        height: {
            type: Number
        },
        size: {
            type: Number // File size in bytes
        },
        mimeType: {
            type: String
        },
        uploadedAt: {
            type: Date
        }
    },


    // Policy and platform
    policyHighlights: {
        type: String,
        maxLength: [2000, "Policy highlights cannot exceed 2000 characters"],
        trim: true
    },
    policies: {
        education: { type: String },
        infrastructure: { type: String },
        studentWelfare: { type: String },
        sports: { type: String },
        culture: { type: String },
        environment: { type: String },
        custom: { type: mongoose.Schema.Types.Mixed }
    },

    contactInfo: {
        email: { type: String },
        phone: { type: String },
        alternativeEmail: { type: String }
    },

    endorsements: [{
        endorserName: { type: String },
        endorserTitle: { type: String },
        endorsementText: { type: String },
        endorserContact: { type: String },
        verified: { type: Boolean, default: false }
    }],

    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectedAt: {
        type: Date
    },
    rejectionReason: {
        type: String,
        trim: true
    },
    rejectionDetails: {
        type: String,
        trim: true
    },
    // Withdrawal information
    withdrawnAt: {
        type: Date
    },
    withdrawalReason: {
        type: String,
        trim: true
    },
    // Statistics and performance
    statistics: {
        totalVotes: { type: Number, default: 0 },
        votePercentage: { type: Number, default: 0 },
        rank: { type: Number },
        isWinner: { type: Boolean, default: false },
        campaignViews: { type: Number, default: 0 },
        socialMediaFollowers: { type: Number, default: 0 }
    },
    // Campaign events
    campaignEvents: [{
        title: { type: String },
        description: { type: String },
        eventType: { type: String, enum: ['RALLY', 'DEBATE', 'MEETING', 'ANNOUNCEMENT', 'INTERVIEW'] },
        startDate: { type: Date },
        endDate: { type: Date },
        location: { type: String },
        attendees: { type: Number, default: 0 },
        status: { type: String, enum: ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'], default: 'SCHEDULED' }
    }],
    // Audit fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    collection: 'candidates'
})

// Indexes for performance
candidateSchema.index({ voterId: 1 })
candidateSchema.index({ positionId: 1 })
candidateSchema.index({ electionId: 1 })
candidateSchema.index({ status: 1 })
candidateSchema.index({ nominationStatus: 1 })
candidateSchema.index({ createdBy: 1 })

// Compound unique index
candidateSchema.index({ voterId: 1, positionId: 1 }, { unique: true })
candidateSchema.index({ electionId: 1, positionId: 1 })

// Virtual for campaign status
candidateSchema.virtual('campaignStatus').get(function () {
    if (this.status === 'APPROVED') return 'ACTIVE'
    if (this.status === 'PENDING') return 'PENDING_APPROVAL'
    if (this.status === 'REJECTED') return 'REJECTED'
    if (this.status === 'WITHDRAWN') return 'WITHDRAWN'
    return 'INACTIVE'
})

// Virtual for display name
candidateSchema.virtual('candidateDisplayName').get(function () {
    return this.displayName || this.fullName
})

// Static methods
candidateSchema.statics.findByElection = function (electionId) {
    return this.find({ electionId }).populate('voterId positionId')
}

candidateSchema.statics.findByPosition = function (positionId) {
    return this.find({ positionId }).populate('voterId')
}

candidateSchema.statics.findApprovedCandidates = function (electionId) {
    return this.find({ electionId, status: 'APPROVED' }).populate('voterId positionId')
}

candidateSchema.statics.findPendingCandidates = function (electionId) {
    return this.find({ electionId, status: 'PENDING' }).populate('voterId positionId')
}

candidateSchema.statics.findByStatus = function (electionId, status) {
    return this.find({ electionId, status }).populate('voterId positionId')
}

candidateSchema.statics.getCandidateStats = function (electionId) {
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

// Instance methods
candidateSchema.methods.approveCandidate = function (approvedBy, notes) {
    this.status = 'APPROVED'
    this.approvedBy = approvedBy
    this.approvedAt = new Date()
    this.approvalNotes = notes
    return this.save()
}

candidateSchema.methods.rejectCandidate = function (rejectedBy, reason, details) {
    this.status = 'REJECTED'
    this.rejectedBy = rejectedBy
    this.rejectedAt = new Date()
    this.rejectionReason = reason
    this.rejectionDetails = details
    return this.save()
}

candidateSchema.methods.withdrawCandidate = function (reason) {
    this.status = 'WITHDRAWN'
    this.withdrawnAt = new Date()
    this.withdrawalReason = reason
    return this.save()
}


candidateSchema.methods.addCampaignMaterial = function (material) {
    this.campaignMaterials.push({
        ...material,
        uploadedAt: new Date()
    })
    return this.save()
}

candidateSchema.methods.addCampaignEvent = function (event) {
    this.campaignEvents.push({
        ...event,
        status: 'SCHEDULED'
    })
    return this.save()
}

candidateSchema.methods.addEndorsement = function (endorsement) {
    this.endorsements.push({
        ...endorsement,
        verified: false
    })
    return this.save()
}

candidateSchema.methods.updateCampaignBudget = function (allocated, spent) {
    this.campaignBudget.allocated = allocated
    this.campaignBudget.spent = spent
    this.campaignBudget.remaining = allocated - spent
    return this.save()
}

candidateSchema.methods.addExpense = function (expense) {
    this.campaignExpenses.push({
        ...expense,
        date: new Date()
    })
    this.campaignBudget.spent += expense.amount
    this.campaignBudget.remaining = this.campaignBudget.allocated - this.campaignBudget.spent
    return this.save()
}

candidateSchema.methods.updateStatistics = function (votes, percentage, rank, isWinner) {
    this.statistics.totalVotes = votes || this.statistics.totalVotes
    this.statistics.votePercentage = percentage || this.statistics.votePercentage
    this.statistics.rank = rank || this.statistics.rank
    this.statistics.isWinner = isWinner !== undefined ? isWinner : this.statistics.isWinner
    return this.save()
}

candidateSchema.methods.getCampaignSummary = function () {
    return {
        id: this._id,
        name: this.fullName,
        position: this.positionId,
        status: this.status,
        manifesto: this.manifesto,
        slogan: this.campaignSlogan,
        policies: this.policies,
        statistics: this.statistics,
        campaignEvents: this.campaignEvents.length,
        endorsements: this.endorsements.length
    }
}

candidateSchema.methods.isEligibleForPosition = function () {
    return this.eligibilityVerified && this.status === 'APPROVED'
}

candidateSchema.methods.canCampaign = function () {
    return this.status === 'APPROVED' && this.eligibilityVerified
}



const candidate = mongoose.model('Candidate', candidateSchema)

module.exports = candidate
