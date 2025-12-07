const mongoose = require('mongoose')

const emailTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    htmlBody: {
        type: String,
        required: true
    },
    textBody: {
        type: String
    },
    variables: {
        type: [String],
        default: []
    },
    category: {
        type: String,
        enum: ['SYSTEM', 'ELECTION', 'VOTE', 'POLL', 'NOTIFICATION', 'CUSTOM'],
        default: 'CUSTOM'
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'email_templates'
})

// Indexes
emailTemplateSchema.index({ name: 1, isActive: 1 })
emailTemplateSchema.index({ category: 1 })
emailTemplateSchema.index({ isDefault: 1 })

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema)

module.exports = EmailTemplate

