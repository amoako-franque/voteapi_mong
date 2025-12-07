const mongoose = require('mongoose')

const ticketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['TECHNICAL_ISSUE', 'FRAUD_REPORT', 'ACCESS_ISSUE', 'GENERAL_INQUIRY', 'BUG_REPORT']
    },
    priority: {
        type: String,
        default: 'MEDIUM',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    status: {
        type: String,
        default: 'OPEN',
        enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED']
    },
    reporterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterRegistry'
    },
    associationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Association'
    },

    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    },

    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    attachments: {
        type: mongoose.Schema.Types.Mixed
    },
    resolution: {
        type: String
    },
    resolvedAt: {
        type: Date
    }
}, {
    timestamps: true,
    collection: 'tickets'
})

const ticket = mongoose.model('Ticket', ticketSchema)

module.exports = ticket
