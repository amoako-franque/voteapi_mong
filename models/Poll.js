const mongoose = require('mongoose')

const pollSchema = new mongoose.Schema({
    // Basic information
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [2000, 'Description cannot exceed 2000 characters']
    },

    // Poll type: RATING (rate one item) or COMPARISON (choose best from multiple options)
    pollType: {
        type: String,
        enum: ['RATING', 'COMPARISON'],
        default: 'RATING'
    },

    // Poll category/type
    category: {
        type: String,
        required: true,
        enum: [
            'COMPANY',
            'POLITICIAN',
            'SERVICE_PROVIDER',
            'DEVICE',
            'FOOD',
            'RESTAURANT',
            'APP',
            'PRODUCT',
            'SERVICE',
            'PERSON',
            'PLACE',
            'EVENT',
            'OTHER'
        ],
        default: 'OTHER'
    },

    // What/who is being rated (for RATING type polls)
    subject: {
        name: {
            type: String,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        image: {
            type: String // URL to image
        },
        website: {
            type: String
        }
    },

    // Options for comparison polls (for COMPARISON type polls)
    options: [{
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        image: {
            type: String // URL to image
        },
        website: {
            type: String
        },
        order: {
            type: Number,
            default: 0
        }
    }],

    // Rating options (e.g., 1-5 stars, Yes/No, etc.)
    ratingOptions: {
        type: {
            type: String,
            enum: ['STARS', 'SCALE', 'YES_NO', 'CUSTOM'],
            default: 'STARS'
        },
        minValue: {
            type: Number,
            default: 1
        },
        maxValue: {
            type: Number,
            default: 5
        },
        labels: [{
            value: { type: Number },
            label: { type: String }
        }],
        customOptions: [{
            value: { type: String },
            label: { type: String }
        }]
    },

    // Dates
    startDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },

    // Visibility
    isPublic: {
        type: Boolean,
        default: true
    },

    // Privacy settings
    visibility: {
        type: String,
        enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
        default: 'PUBLIC'
    },

    // Creator information
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // null for anonymous creators
    },
    creatorEmail: {
        type: String,
        lowercase: true,
        trim: true
    },
    creatorName: {
        type: String,
        trim: true
    },
    isAnonymousCreator: {
        type: Boolean,
        default: false
    },

    // Status
    status: {
        type: String,
        enum: ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'],
        default: 'DRAFT'
    },

    // Settings
    settings: {
        allowMultipleVotes: {
            type: Boolean,
            default: false
        },
        requireRegistration: {
            type: Boolean,
            default: false
        },
        showResultsBeforeEnd: {
            type: Boolean,
            default: false
        },
        allowComments: {
            type: Boolean,
            default: true
        },
        sendResultsToVoters: {
            type: Boolean,
            default: true
        },
        sendResultsToCreator: {
            type: Boolean,
            default: true
        }
    },

    // Statistics
    statistics: {
        totalVotes: {
            type: Number,
            default: 0
        },
        registeredVotes: {
            type: Number,
            default: 0
        },
        anonymousVotes: {
            type: Number,
            default: 0
        },
        averageRating: {
            type: Number,
            default: 0
        },
        ratingDistribution: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        // For comparison polls: vote counts and percentages per option
        optionVotes: {
            type: mongoose.Schema.Types.Mixed,
            default: {} // { optionId: { count: number, percentage: number } }
        },
        lastCalculatedAt: {
            type: Date
        }
    },

    // Tags for searchability
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],

    // Metadata
    views: {
        type: Number,
        default: 0
    },
    shares: {
        type: Number,
        default: 0
    },

    // Results notification
    resultsSent: {
        type: Boolean,
        default: false
    },
    resultsSentAt: {
        type: Date
    }
}, {
    timestamps: true,
    collection: 'polls'
})

// Indexes
pollSchema.index({ status: 1, startDate: 1, endDate: 1 })
pollSchema.index({ createdBy: 1 })
pollSchema.index({ category: 1 })
pollSchema.index({ visibility: 1 })
pollSchema.index({ isPublic: 1 })
pollSchema.index({ tags: 1 })
pollSchema.index({ 'subject.name': 'text', title: 'text', description: 'text' })
pollSchema.index({ createdAt: -1 })

// Virtual for checking if poll is active
pollSchema.virtual('isActive').get(function () {
    const now = new Date()
    return this.status === 'ACTIVE' &&
        now >= this.startDate &&
        now <= this.endDate
})

// Virtual for checking if poll has ended
pollSchema.virtual('hasEnded').get(function () {
    const now = new Date()
    return this.status === 'ENDED' || now > this.endDate
})

// Methods
pollSchema.methods.updateStatistics = async function () {
    const PollVote = mongoose.model('PollVote')

    const totalVotes = await PollVote.countDocuments({ pollId: this._id })
    const registeredVotes = await PollVote.countDocuments({
        pollId: this._id,
        userId: { $ne: null }
    })
    const anonymousVotes = totalVotes - registeredVotes

    let averageRating = 0
    let ratingDistribution = {}
    let optionVotes = {}

    if (this.pollType === 'COMPARISON') {
        // For comparison polls: count votes per option and calculate percentages
        const votes = await PollVote.find({ pollId: this._id })

        // Initialize optionVotes for all options
        this.options.forEach(option => {
            optionVotes[option.id] = {
                count: 0,
                percentage: 0
            }
        })

        // Count votes per option
        votes.forEach(vote => {
            if (vote.selectedOptionId) {
                if (!optionVotes[vote.selectedOptionId]) {
                    optionVotes[vote.selectedOptionId] = { count: 0, percentage: 0 }
                }
                optionVotes[vote.selectedOptionId].count += 1
            }
        })

        // Calculate percentages
        Object.keys(optionVotes).forEach(optionId => {
            optionVotes[optionId].percentage = totalVotes > 0
                ? Math.round((optionVotes[optionId].count / totalVotes) * 100 * 100) / 100 // Round to 2 decimal places
                : 0
        })
    } else {
        // For rating polls: calculate average rating
        const votes = await PollVote.find({ pollId: this._id })
        let totalRating = 0

        votes.forEach(vote => {
            if (vote.rating !== null && vote.rating !== undefined) {
                totalRating += vote.rating
                ratingDistribution[vote.rating] = (ratingDistribution[vote.rating] || 0) + 1
            }
        })

        averageRating = totalVotes > 0 ? Math.round((totalRating / totalVotes) * 100) / 100 : 0
    }

    this.statistics = {
        totalVotes,
        registeredVotes,
        anonymousVotes,
        averageRating,
        ratingDistribution,
        optionVotes,
        lastCalculatedAt: new Date()
    }

    return this.save()
}

pollSchema.methods.canVote = function () {
    const now = new Date()
    return this.status === 'ACTIVE' &&
        now >= this.startDate &&
        now <= this.endDate
}

pollSchema.methods.getResults = async function () {
    await this.updateStatistics()

    const PollVote = mongoose.model('PollVote')
    const votes = await PollVote.find({ pollId: this._id })
        .populate('userId', 'email firstname lastname')
        .sort({ createdAt: -1 })

    const result = {
        poll: {
            id: this._id,
            title: this.title,
            pollType: this.pollType,
            category: this.category
        },
        statistics: this.statistics,
        votes: votes.map(vote => ({
            rating: vote.rating,
            selectedOptionId: vote.selectedOptionId,
            comment: vote.comment,
            isAnonymous: !vote.userId,
            createdAt: vote.createdAt
        }))
    }

    // Add poll-specific data
    if (this.pollType === 'RATING') {
        result.poll.subject = this.subject
    } else if (this.pollType === 'COMPARISON') {
        result.poll.options = this.options.map(option => ({
            ...option.toObject(),
            votes: this.statistics.optionVotes[option.id]?.count || 0,
            percentage: this.statistics.optionVotes[option.id]?.percentage || 0
        }))
        // Sort options by vote count (descending)
        result.poll.options.sort((a, b) => b.votes - a.votes)
    }

    return result
}

// Pre-save middleware
pollSchema.pre('save', function (next) {
    const now = new Date()

    // Auto-update status based on dates
    if (this.status !== 'CANCELLED' && this.status !== 'ENDED') {
        if (now < this.startDate) {
            this.status = 'DRAFT'
        } else if (now >= this.startDate && now <= this.endDate) {
            this.status = 'ACTIVE'
        } else if (now > this.endDate) {
            this.status = 'ENDED'
        }
    }

    // Validate dates
    if (this.endDate <= this.startDate) {
        return next(new Error('End date must be after start date'))
    }

    // Validate poll type and required fields
    if (this.pollType === 'RATING') {
        if (!this.subject || !this.subject.name) {
            return next(new Error('Rating polls require a subject'))
        }
    } else if (this.pollType === 'COMPARISON') {
        if (!this.options || this.options.length < 2) {
            return next(new Error('Comparison polls require at least 2 options'))
        }
        if (this.options.length > 10) {
            return next(new Error('Comparison polls can have maximum 10 options'))
        }
        // Ensure each option has an id
        this.options.forEach((option, index) => {
            if (!option.id) {
                option.id = `option_${ index + 1 }_${ Date.now() }`
            }
        })
    }

    // Set creator info for anonymous creators
    if (!this.createdBy && !this.isAnonymousCreator) {
        this.isAnonymousCreator = true
    }

    next()
})

const Poll = mongoose.model('Poll', pollSchema)

module.exports = Poll

