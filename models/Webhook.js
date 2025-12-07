const mongoose = require('mongoose')

const webhookSchema = new mongoose.Schema({
    event: {
        type: String,
        required: true,
        index: true,
        enum: [
            'vote.cast',
            'vote.verified',
            'election.created',
            'election.started',
            'election.completed',
            'election.cancelled',
            'candidate.approved',
            'candidate.rejected',
            'poll.created',
            'poll.ended',
            'user.created',
            'user.suspended',
            'user.activated',
            'result.calculated',
            'result.published'
        ]
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    secret: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true,
        index: true
    },
    retries: {
        type: Number,
        default: 0
    },
    maxRetries: {
        type: Number,
        default: 3
    },
    timeout: {
        type: Number,
        default: 5000 // milliseconds
    },
    headers: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastTriggeredAt: {
        type: Date
    },
    lastSuccessAt: {
        type: Date
    },
    lastFailureAt: {
        type: Date
    },
    totalTriggers: {
        type: Number,
        default: 0
    },
    totalSuccesses: {
        type: Number,
        default: 0
    },
    totalFailures: {
        type: Number,
        default: 0
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'webhooks'
})

// Indexes
webhookSchema.index({ event: 1, active: 1 })
webhookSchema.index({ createdBy: 1 })
webhookSchema.index({ active: 1, createdAt: -1 })

const Webhook = mongoose.model('Webhook', webhookSchema)

module.exports = Webhook

