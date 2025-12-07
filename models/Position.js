const mongoose = require('mongoose')

const positionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    shortDescription: {
        type: String,
        maxLength: [200, "Short description cannot exceed 200 characters"],
        trim: true
    },
    // Position hierarchy and ordering
    orderIndex: {
        type: Number,
        required: true,
        min: 1
    },
    category: {
        type: String,
        enum: ['EXECUTIVE', 'LEGISLATIVE', 'JUDICIAL', 'ADMINISTRATIVE', 'REPRESENTATIVE', 'CUSTOM'],
        default: 'REPRESENTATIVE'
    },
    level: {
        type: String,
        enum: ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'REPRESENTATIVE', 'MEMBER', 'CUSTOM'],
        default: 'REPRESENTATIVE'
    },
    // Scope definition
    scope: {
        type: String,
        enum: ['SCHOOL', 'ASSOCIATION'],
        required: true
    },
    associationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Association'
    },
    // Candidate limits and requirements
    maxCandidates: {
        type: Number,
        default: 10,
        min: 1
    },
    minCandidates: {
        type: Number,
        default: 1,
        min: 1
    },
    maxWinners: {
        type: Number,
        default: 1,
        min: 1
    },
    // Eligibility criteria for candidates
    eligibilityCriteria: {
        minAge: { type: Number },
        maxAge: { type: Number },
        requiredYearOfStudy: { type: String },
        requiredAssociation: { type: mongoose.Schema.Types.ObjectId, ref: 'Association' },
        requiredGPA: { type: Number },
        requiredExperience: { type: String },
        customCriteria: { type: mongoose.Schema.Types.Mixed }
    },
    // Voting configuration
    votingMethod: {
        type: String,
        enum: ['SINGLE_VOTE', 'RANKED_CHOICE', 'APPROVAL_VOTING', 'PROPORTIONAL'],
        default: 'SINGLE_VOTE'
    },
    allowAbstention: {
        type: Boolean,
        default: true
    },
    // Position details
    termLength: {
        type: String,
        default: '1 year'
    },

    // Status and metadata
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
        default: 'ACTIVE'
    },

    // Election reference
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election',
        required: true
    },
    // Statistics
    statistics: {
        totalCandidates: { type: Number, default: 0 },
        totalVotes: { type: Number, default: 0 },
        winnerCount: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    },
    // Audit fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    collection: 'positions'
})

// Indexes for performance
positionSchema.index({ title: 1 })
positionSchema.index({ electionId: 1 })
positionSchema.index({ scope: 1 })
positionSchema.index({ associationId: 1 })
positionSchema.index({ category: 1, level: 1 })
positionSchema.index({ status: 1 })
positionSchema.index({ orderIndex: 1 })
positionSchema.index({ createdBy: 1 })

// Compound indexes
positionSchema.index({ electionId: 1, orderIndex: 1 })
positionSchema.index({ electionId: 1, category: 1 })
positionSchema.index({ scope: 1, associationId: 1 })

// Virtual for position hierarchy
positionSchema.virtual('hierarchyLevel').get(function () {
    const hierarchy = {
        'PRESIDENT': 1,
        'VICE_PRESIDENT': 2,
        'SECRETARY': 3,
        'TREASURER': 4,
        'REPRESENTATIVE': 5,
        'MEMBER': 6,
        'CUSTOM': 7
    }
    return hierarchy[this.level] || 7
})

// Virtual for display name
positionSchema.virtual('displayName').get(function () {
    return `${ this.title } (${ this.level })`
})

// Static methods
positionSchema.statics.findByElection = function (electionId) {
    return this.find({ electionId }).sort({ orderIndex: 1 })
}

positionSchema.statics.findByCategory = function (electionId, category) {
    return this.find({ electionId, category }).sort({ orderIndex: 1 })
}

positionSchema.statics.findByScope = function (scope, scopeId) {
    const query = { scope }
    switch (scope) {
        case 'ASSOCIATION':
            query.associationId = scopeId
            break
    }
    return this.find(query).sort({ orderIndex: 1 })
}

positionSchema.statics.findRequiredPositions = function (electionId) {
    return this.find({ electionId, isRequired: true }).sort({ orderIndex: 1 })
}

positionSchema.statics.findPublicPositions = function (electionId) {
    return this.find({ electionId, isPublic: true }).sort({ orderIndex: 1 })
}

// Instance methods
positionSchema.methods.isEligibleCandidate = function (candidateData) {
    const criteria = this.eligibilityCriteria

    // Check age criteria
    if (criteria.minAge && candidateData.age < criteria.minAge) return false
    if (criteria.maxAge && candidateData.age > criteria.maxAge) return false

    // Check year of study
    if (criteria.requiredYearOfStudy && candidateData.yearOfStudy !== criteria.requiredYearOfStudy) return false

    // Check association membership
    if (criteria.requiredAssociation && candidateData.associationId?.toString() !== criteria.requiredAssociation.toString()) return false

    // Check GPA
    if (criteria.requiredGPA && candidateData.gpa < criteria.requiredGPA) return false

    return true
}

positionSchema.methods.getEligibilitySummary = function () {
    const criteria = this.eligibilityCriteria
    const summary = []

    if (criteria.minAge || criteria.maxAge) {
        summary.push(`Age: ${ criteria.minAge || 'No min' } - ${ criteria.maxAge || 'No max' }`)
    }
    if (criteria.requiredYearOfStudy) {
        summary.push(`Year of Study: ${ criteria.requiredYearOfStudy }`)
    }
    if (criteria.requiredGPA) {
        summary.push(`Minimum GPA: ${ criteria.requiredGPA }`)
    }
    if (criteria.requiredExperience) {
        summary.push(`Experience: ${ criteria.requiredExperience }`)
    }

    return summary.join(', ')
}

positionSchema.methods.updateStatistics = function (candidateCount, voteCount, winnerCount) {
    this.statistics.totalCandidates = candidateCount || this.statistics.totalCandidates
    this.statistics.totalVotes = voteCount || this.statistics.totalVotes
    this.statistics.winnerCount = winnerCount || this.statistics.winnerCount
    this.statistics.lastUpdated = new Date()
    return this.save()
}

positionSchema.methods.canAcceptMoreCandidates = function () {
    return this.statistics.totalCandidates < this.maxCandidates
}

positionSchema.methods.isPositionFilled = function () {
    return this.statistics.winnerCount >= this.maxWinners
}

positionSchema.methods.getPositionSummary = function () {
    return {
        id: this._id,
        title: this.title,
        description: this.description,
        category: this.category,
        level: this.level,
        scope: this.scope,
        maxCandidates: this.maxCandidates,
        maxWinners: this.maxWinners,
        votingMethod: this.votingMethod,
        termLength: this.termLength,
        eligibilityCriteria: this.getEligibilitySummary(),
        statistics: this.statistics
    }
}

// Pre-save middleware
positionSchema.pre('save', function (next) {
    // Ensure maxCandidates is not less than minCandidates
    if (this.maxCandidates < this.minCandidates) {
        return next(new Error('Max candidates cannot be less than min candidates'))
    }

    // Ensure maxWinners is not greater than maxCandidates
    if (this.maxWinners > this.maxCandidates) {
        return next(new Error('Max winners cannot be greater than max candidates'))
    }

    // Set updatedBy if not set
    if (this.isModified() && !this.updatedBy) {
        this.updatedBy = this.createdBy
    }

    next()
})

const position = mongoose.model('Position', positionSchema)

module.exports = position
