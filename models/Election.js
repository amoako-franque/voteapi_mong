const mongoose = require('mongoose')

const electionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    type: {
        type: String,
        required: true,
        enum: [
            'SRC_ELECTION',
            'CLASS_REPRESENTATIVE',
            'GENERAL_ELECTION',
            'REFERENDUM',
            'CUSTOM',
            'ASSOCIATION_ELECTION',
        ]
    },
    status: {
        type: String,
        default: 'DRAFT',
        enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'FROZEN']
    },
    startDateTime: {
        type: Date,
        required: true
    },
    endDateTime: {
        type: Date,
        required: true
    },
    timezone: {
        type: String,
        default: 'Africa/Accra'
    },
    allowAnonymousVoting: {
        type: Boolean,
        default: false
    },
    settings: {
        type: mongoose.Schema.Types.Mixed
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    },
    associationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Association'
    },

    scope: {
        type: String,
        required: true,
        enum: ['SCHOOL', 'ASSOCIATION', 'PUBLIC']
    },

    votingRules: {
        allowAbstention: { type: Boolean, default: true },
        maxVotesPerPosition: { type: Number, default: 1 },
        requireAllPositions: { type: Boolean, default: false },
        allowWriteIn: { type: Boolean, default: false },
        allowMultipleCandidates: { type: Boolean, default: false },
        votingMethod: {
            type: String,
            enum: ['SINGLE_VOTE', 'RANKED_CHOICE', 'APPROVAL_VOTING', 'PROPORTIONAL'],
            default: 'SINGLE_VOTE'
        }
    },

    registrationDeadline: {
        type: Date
    },
    candidateNominationDeadline: {
        type: Date
    },
    campaignPeriod: {
        startDate: { type: Date },
        endDate: { type: Date }
    },

    resultsSettings: {
        showResultsImmediately: { type: Boolean, default: false },
        showDetailedResults: { type: Boolean, default: true },
        showVoteCounts: { type: Boolean, default: true },
        showPercentages: { type: Boolean, default: true },
        allowResultDisputes: { type: Boolean, default: true }
    },

    securitySettings: {
        requireVoterVerification: { type: Boolean, default: true },
        allowMultipleVotingSessions: { type: Boolean, default: false },
        sessionTimeout: { type: Number, default: 30 },
        maxVotingAttempts: { type: Number, default: 3 },
        requireDeviceFingerprint: { type: Boolean, default: false }
    },

    notificationSettings: {
        notifyOnRegistrationOpen: { type: Boolean, default: true },
        notifyOnNominationOpen: { type: Boolean, default: true },
        notifyOnVotingOpen: { type: Boolean, default: true },
        notifyOnDeadlineReminder: { type: Boolean, default: true },
        notifyOnResultsAvailable: { type: Boolean, default: true },
        reminderDays: [{ type: Number }]
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    confirmedAt: {
        type: Date
    },

    statistics: {
        totalEligibleVoters: { type: Number, default: 0 },
        totalRegisteredVoters: { type: Number, default: 0 },
        totalCandidates: { type: Number, default: 0 },
        totalPositions: { type: Number, default: 0 },
        totalVotesCast: { type: Number, default: 0 },
        turnoutPercentage: { type: Number, default: 0 },
        lastCalculatedAt: { type: Date }
    },

    currentPhase: {
        type: String,
        enum: ['REGISTRATION', 'NOMINATION', 'CAMPAIGN', 'VOTING', 'RESULTS', 'COMPLETED'],
        default: 'REGISTRATION'
    },

    tags: [{ type: String }],
    isPublic: {
        type: Boolean,
        default: false
    },
    featured: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    collection: 'elections'
})


electionSchema.index({ title: 1 })
electionSchema.index({ status: 1 })
electionSchema.index({ scope: 1 })
electionSchema.index({ schoolId: 1 })
electionSchema.index({ associationId: 1 })
electionSchema.index({ createdBy: 1 })
electionSchema.index({ startDateTime: 1, endDateTime: 1 })
electionSchema.index({ currentPhase: 1 })
electionSchema.index({ isPublic: 1, featured: 1 })


electionSchema.index({ scope: 1, schoolId: 1 })
electionSchema.index({ scope: 1, associationId: 1 })


electionSchema.virtual('duration').get(function () {
    return this.endDateTime - this.startDateTime
})


electionSchema.virtual('timeUntilStart').get(function () {
    return this.startDateTime - new Date()
})


electionSchema.virtual('timeUntilEnd').get(function () {
    return this.endDateTime - new Date()
})


electionSchema.virtual('isActive').get(function () {
    const now = new Date()
    return this.status === 'ACTIVE' && now >= this.startDateTime && now <= this.endDateTime
})

electionSchema.virtual('isUpcoming').get(function () {
    const now = new Date()
    return this.status === 'SCHEDULED' && now < this.startDateTime
})

electionSchema.virtual('isCompleted').get(function () {
    const now = new Date()
    return this.status === 'COMPLETED' || (this.status === 'ACTIVE' && now > this.endDateTime)
})


electionSchema.statics.findByScope = function (scope, scopeId) {
    const query = { scope }
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

electionSchema.statics.findActiveElections = function () {
    const now = new Date()
    return this.find({
        status: 'ACTIVE',
        startDateTime: { $lte: now },
        endDateTime: { $gte: now }
    })
}

electionSchema.statics.findUpcomingElections = function () {
    const now = new Date()
    return this.find({
        status: { $in: ['SCHEDULED', 'DRAFT'] },
        startDateTime: { $gt: now }
    })
}

electionSchema.statics.findCompletedElections = function () {
    const now = new Date()
    return this.find({
        $or: [
            { status: 'COMPLETED' },
            { status: 'ACTIVE', endDateTime: { $lt: now } }
        ]
    })
}

electionSchema.statics.findByPhase = function (phase) {
    return this.find({ currentPhase: phase })
}


electionSchema.methods.updatePhase = function () {
    const now = new Date()

    if (now < this.registrationDeadline) {
        this.currentPhase = 'REGISTRATION'
    } else if (now < this.candidateNominationDeadline) {
        this.currentPhase = 'NOMINATION'
    } else if (now < this.campaignPeriod?.startDate) {
        this.currentPhase = 'CAMPAIGN'
    } else if (now >= this.startDateTime && now <= this.endDateTime) {
        this.currentPhase = 'VOTING'
    } else if (now > this.endDateTime) {
        this.currentPhase = 'RESULTS'
    }

    // Don't save here - let the caller handle saving
    // This prevents parallel save errors when called from pre-save hooks
    return this
}

electionSchema.methods.canVote = function () {
    const now = new Date()
    // Voting is allowed only if:
    // 1. Election status is ACTIVE
    // 2. Current time is between startDateTime and endDateTime
    // 3. Current phase is VOTING
    const { ELECTION_STATUS, ELECTION_PHASES } = require('../utils/constants')
    return this.status === ELECTION_STATUS.ACTIVE &&
        now >= this.startDateTime &&
        now <= this.endDateTime &&
        this.currentPhase === ELECTION_PHASES.VOTING
}

electionSchema.methods.canRegisterVoters = function () {
    const now = new Date()
    return !this.registrationDeadline || now <= this.registrationDeadline
}

electionSchema.methods.canNominateCandidates = function () {
    const now = new Date()
    return !this.candidateNominationDeadline || now <= this.candidateNominationDeadline
}

electionSchema.methods.isInCampaignPeriod = function () {
    const now = new Date()
    return this.campaignPeriod?.startDate && this.campaignPeriod?.endDate &&
        now >= this.campaignPeriod.startDate && now <= this.campaignPeriod.endDate
}

electionSchema.methods.updateStatistics = function () {


    this.statistics.lastCalculatedAt = new Date()
    return this.save()
}



electionSchema.pre('save', function (next) {
    // Update phase without saving (we're already in a save operation)
    this.updatePhase()

    // Validate election must be linked to either school or association based on scope
    if (this.scope === 'SCHOOL' && !this.schoolId) {
        return next(new Error('School elections must be linked to a school'))
    }

    if (this.scope === 'ASSOCIATION' && !this.associationId) {
        return next(new Error('Association elections must be linked to an association'))
    }

    // For SCHOOL scope, associationId should not be set
    if (this.scope === 'SCHOOL' && this.associationId) {
        return next(new Error('School elections cannot be linked to an association'))
    }

    // For ASSOCIATION scope, schoolId should not be set (association can have its own schoolId)
    if (this.scope === 'ASSOCIATION' && this.schoolId) {
        return next(new Error('Association elections should not have schoolId directly set'))
    }

    if (this.endDateTime <= this.startDateTime) {
        return next(new Error('End date must be after start date'))
    }


    if (this.registrationDeadline && this.registrationDeadline >= this.startDateTime) {
        return next(new Error('Registration deadline must be before voting starts'))
    }


    if (this.candidateNominationDeadline && this.candidateNominationDeadline >= this.startDateTime) {
        return next(new Error('Nomination deadline must be before voting starts'))
    }

    next()
})

const election = mongoose.model('Election', electionSchema)

module.exports = election
