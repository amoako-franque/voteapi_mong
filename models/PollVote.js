const mongoose = require('mongoose')

const pollVoteSchema = new mongoose.Schema({
    pollId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poll',
        required: true,
        index: true
    },

    // Voter information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // null for anonymous voters
    },
    voterEmail: {
        type: String,
        lowercase: true,
        trim: true
    },
    voterName: {
        type: String,
        trim: true
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },

    // Vote data (for RATING type polls)
    rating: {
        type: Number,
        min: 1
    },
    // Selected option (for COMPARISON type polls)
    selectedOptionId: {
        type: String
    },
    comment: {
        type: String,
        trim: true,
        maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },

    // Metadata
    ipAddress: {
        type: String,
        select: false // Don't expose IP in normal queries
    },
    userAgent: {
        type: String,
        select: false
    },
    deviceFingerprint: {
        type: String,
        select: false
    },

    // Verification
    verified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String,
        select: false
    }
}, {
    timestamps: true,
    collection: 'poll_votes'
})

// Indexes
pollVoteSchema.index({ pollId: 1, userId: 1 })
pollVoteSchema.index({ pollId: 1, createdAt: -1 })
pollVoteSchema.index({ userId: 1 })
pollVoteSchema.index({ pollId: 1, rating: 1 })
pollVoteSchema.index({ pollId: 1, selectedOptionId: 1 })
pollVoteSchema.index({ createdAt: -1 })

// Compound index to prevent duplicate votes (if settings don't allow multiple votes)
pollVoteSchema.index({ pollId: 1, userId: 1, ipAddress: 1 }, {
    unique: false, // We'll handle uniqueness in application logic
    sparse: true
})

// Virtual for voter display name
pollVoteSchema.virtual('voterDisplayName').get(function () {
    if (this.userId) {
        return this.userId.firstname && this.userId.lastname
            ? `${ this.userId.firstname } ${ this.userId.lastname }`
            : this.voterEmail || 'Registered User'
    }
    return this.voterName || 'Anonymous'
})

// Methods
pollVoteSchema.methods.toPublicJSON = function () {
    return {
        id: this._id,
        rating: this.rating,
        comment: this.comment,
        isAnonymous: this.isAnonymous || !this.userId,
        createdAt: this.createdAt,
        voterDisplayName: this.isAnonymous || !this.userId
            ? 'Anonymous'
            : this.voterDisplayName
    }
}

// Pre-save middleware
pollVoteSchema.pre('save', function (next) {
    // Set anonymous flag if no userId
    if (!this.userId) {
        this.isAnonymous = true
    }

    next()
})

const PollVote = mongoose.model('PollVote', pollVoteSchema)

module.exports = PollVote

