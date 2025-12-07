const mongoose = require('mongoose')

const voterRegistrySchema = new mongoose.Schema({
    voterId: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String
    },
    studentNumber: {
        type: String
    },
    employeeNumber: {
        type: String
    },
    gender: {
        type: String
    },
    dateOfBirth: {
        type: Date
    },
    yearOfStudy: {
        type: String
    },
    hasVoted: {
        type: Boolean,
        default: false
    },
    lastVoteAt: {
        type: Date
    },
    // Voter can belong to school
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    },
    // Association reference (professional association or student organization)
    associationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Association'
    },


    // Eligibility and verification
    eligibilityStatus: {
        type: String,
        enum: ['ELIGIBLE', 'INELIGIBLE', 'PENDING_VERIFICATION', 'SUSPENDED'],
        default: 'ELIGIBLE'
    },
    registrationSource: {
        type: String,
        enum: ['MANUAL', 'IMPORT', 'SELF_REGISTRATION', 'BULK_UPLOAD'],
        default: 'MANUAL'
    },
    verificationMethod: {
        type: String,
        enum: ['EMAIL', 'SMS', 'MANUAL', 'DOCUMENT_UPLOAD', 'ADMIN_VERIFIED'],
        default: 'EMAIL'
    },
    // Academic information
    academicInfo: {
        gpa: { type: Number },
        program: { type: String },
        level: { type: String }, // Undergraduate, Graduate, etc.
        semester: { type: String },
        academicYear: { type: String },
        graduationYear: { type: String }
    },

    // Voting history and statistics
    votingHistory: [{
        electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election' },
        votedAt: { type: Date },
        positionsVoted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Position' }],
        voteCount: { type: Number, default: 1 }
    }],

    // Status and metadata
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },

    verifiedAt: {
        type: Date
    },

    lastActivity: {
        type: Date,
        default: Date.now
    },
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
    collection: 'voter_registry'
})

// Indexes for performance
voterRegistrySchema.index({ voterId: 1 })
voterRegistrySchema.index({ email: 1 }, { unique: true })
voterRegistrySchema.index({ studentNumber: 1 }, { sparse: true })
voterRegistrySchema.index({ employeeNumber: 1 }, { sparse: true })
voterRegistrySchema.index({ schoolId: 1 })
voterRegistrySchema.index({ associationId: 1 })
voterRegistrySchema.index({ eligibilityStatus: 1 })
voterRegistrySchema.index({ isActive: 1, isVerified: 1 })
voterRegistrySchema.index({ hasVoted: 1 })
voterRegistrySchema.index({ lastActivity: 1 })

// Compound unique index - voterId must be unique within school
voterRegistrySchema.index({ schoolId: 1, voterId: 1 }, { unique: true, sparse: true })

// Virtual for age calculation
voterRegistrySchema.virtual('age').get(function () {
    if (!this.dateOfBirth) return null
    const today = new Date()
    const birthDate = new Date(this.dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }

    return age
})

// Virtual for full name
voterRegistrySchema.virtual('displayName').get(function () {
    return `${ this.firstName } ${ this.lastName }`.trim()
})

// Static methods
voterRegistrySchema.statics.findByScope = function (scope, scopeId) {
    const query = { isActive: true }
    switch (scope) {
        case 'SCHOOL':
            query.schoolId = scopeId
            break
        case 'ASSOCIATION':
            query.associationId = scopeId
            break
    }
    return this.find(query)
}

voterRegistrySchema.statics.findEligibleVoters = function (electionId) {
    return this.find({
        isActive: true,
        isVerified: true,
        eligibilityStatus: 'ELIGIBLE',
        'eligiblePositions.electionId': electionId
    })
}

voterRegistrySchema.statics.findVotersByElection = function (electionId) {
    return this.find({
        'votingHistory.electionId': electionId
    })
}

voterRegistrySchema.statics.findUnverifiedVoters = function () {
    return this.find({
        isActive: true,
        isVerified: false,
        eligibilityStatus: 'PENDING_VERIFICATION'
    })
}

// Instance methods
voterRegistrySchema.methods.isEligibleForElection = function (electionId) {
    const eligiblePosition = this.eligiblePositions.find(ep =>
        ep.electionId.toString() === electionId.toString()
    )
    return eligiblePosition && eligiblePosition.positionIds.length > 0
}

voterRegistrySchema.methods.getEligiblePositions = function (electionId) {
    const eligiblePosition = this.eligiblePositions.find(ep =>
        ep.electionId.toString() === electionId.toString()
    )
    return eligiblePosition ? eligiblePosition.positionIds : []
}

voterRegistrySchema.methods.hasVotedInElection = function (electionId) {
    return this.votingHistory.some(vh =>
        vh.electionId.toString() === electionId.toString()
    )
}

voterRegistrySchema.methods.addVotingRecord = function (electionId, positionIds) {
    const existingRecord = this.votingHistory.find(vh =>
        vh.electionId.toString() === electionId.toString()
    )

    if (existingRecord) {
        existingRecord.voteCount += 1
        existingRecord.votedAt = new Date()
    } else {
        this.votingHistory.push({
            electionId,
            votedAt: new Date(),
            positionsVoted: positionIds,
            voteCount: 1
        })
    }

    this.hasVoted = true
    this.lastVoteAt = new Date()
    this.totalElectionsVoted += 1
    this.lastActivity = new Date()
}

voterRegistrySchema.methods.updateEligibility = function (electionId, positionIds, reason, verifiedBy) {
    const existingEligibility = this.eligiblePositions.find(ep =>
        ep.electionId.toString() === electionId.toString()
    )

    if (existingEligibility) {
        existingEligibility.positionIds = positionIds
        existingEligibility.eligibilityReason = reason
        existingEligibility.verifiedAt = new Date()
        existingEligibility.verifiedBy = verifiedBy
    } else {
        this.eligiblePositions.push({
            electionId,
            positionIds,
            eligibilityReason: reason,
            verifiedAt: new Date(),
            verifiedBy
        })
    }

    this.eligibilityStatus = positionIds.length > 0 ? 'ELIGIBLE' : 'INELIGIBLE'
    this.lastActivity = new Date()
}

voterRegistrySchema.methods.verifyVoter = function (verifiedBy, method = 'MANUAL') {
    this.isVerified = true
    this.verifiedAt = new Date()
    this.verificationMethod = method
    this.lastActivity = new Date()
}

voterRegistrySchema.methods.suspendVoter = function (reason, suspendedBy) {
    this.eligibilityStatus = 'SUSPENDED'
    this.isActive = false
    this.lastActivity = new Date()
}

voterRegistrySchema.methods.reactivateVoter = function (reactivatedBy) {
    this.eligibilityStatus = 'ELIGIBLE'
    this.isActive = true
    this.lastActivity = new Date()
}

voterRegistrySchema.methods.updateLastActivity = function () {
    this.lastActivity = new Date()
    return this.save()
}

voterRegistrySchema.methods.getVotingStats = function () {
    return {
        totalElectionsVoted: this.totalElectionsVoted,
        votingHistory: this.votingHistory.length,
        lastVoteAt: this.lastVoteAt,
        eligibilityStatus: this.eligibilityStatus,
        isVerified: this.isVerified
    }
}

// Pre-save middleware
voterRegistrySchema.pre('save', async function (next) {
    // Ensure fullName is always set
    if (this.firstName && this.lastName) {
        this.fullName = `${ this.firstName } ${ this.lastName }`.trim()
    }

    // Validate: Voter must belong to a school
    if (!this.schoolId) {
        return next(new Error('Voter must belong to a school'))
    }

    // Set updatedBy if not set
    if (this.isModified() && !this.updatedBy) {
        this.updatedBy = this.createdBy
    }

    // Update lastActivity on any change
    this.lastActivity = new Date()

    next()
})

const voterRegistry = mongoose.model('VoterRegistry', voterRegistrySchema)

module.exports = voterRegistry
