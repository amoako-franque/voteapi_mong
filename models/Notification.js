const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['ELECTION_START', 'ELECTION_REMINDER', 'ELECTION_END', 'CANDIDATE_APPROVED', 'CANDIDATE_REJECTED', 'VOTE_CONFIRMATION', 'SYSTEM_ALERT']
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterRegistry'
    },

    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    },
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election'
    },
    channel: {
        type: String,
        required: true,
        enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP']
    },
    status: {
        type: String,
        default: 'PENDING',
        enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ']
    },
    sentAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    },
    readAt: {
        type: Date
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true,
    collection: 'notifications'
})

const notification = mongoose.model('Notification', notificationSchema)

module.exports = notification
