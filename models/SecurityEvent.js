const mongoose = require('mongoose')

const securityEventSchema = new mongoose.Schema({
    // Event identification
    eventType: {
        type: String,
        required: true,
        enum: [
            'FAILED_LOGIN',
            'MULTIPLE_FAILED_ATTEMPTS',
            'SUSPICIOUS_IP',
            'UNUSUAL_VOTING_PATTERN',
            'CODE_BRUTE_FORCE',
            'SESSION_HIJACKING',
            'UNAUTHORIZED_ACCESS',
            'DATA_BREACH_ATTEMPT',
            'SYSTEM_INTRUSION',
            'MALICIOUS_UPLOAD',
            'RATE_LIMIT_EXCEEDED',
            'GEOGRAPHIC_ANOMALY',
            'DEVICE_FINGERPRINT_MISMATCH',
            'VOTE_MANIPULATION_ATTEMPT',
            'ADMIN_PRIVILEGE_ESCALATION',
            'CUSTOM_SECURITY_EVENT'
        ]
    },
    severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        required: true
    },
    // User and session information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    sessionId: {
        type: String
    },
    // Event details
    description: {
        type: String,
        required: true,
        trim: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed
    },
    // Request information
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: {
        type: String
    },
    deviceFingerprint: {
        type: String
    },
    // Location information
    location: {
        country: { type: String },
        region: { type: String },
        city: { type: String },
        coordinates: {
            latitude: { type: Number },
            longitude: { type: Number }
        },
        isp: { type: String },
        timezone: { type: String }
    },
    // Related resources
    electionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Election'
    },
    positionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Position'
    },
    voteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vote'
    },
    secretCodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VoterSecretCode'
    },
    // Event status
    status: {
        type: String,
        enum: ['ACTIVE', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE', 'ESCALATED'],
        default: 'ACTIVE'
    },
    // Investigation details
    investigatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    investigationNotes: {
        type: String,
        trim: true
    },
    investigationStartedAt: {
        type: Date
    },
    investigationCompletedAt: {
        type: Date
    },
    // Resolution details
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolutionNotes: {
        type: String,
        trim: true
    },
    resolvedAt: {
        type: Date
    },
    // Risk assessment
    riskScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    riskFactors: [{
        factor: { type: String },
        score: { type: Number },
        description: { type: String }
    }],
    // Automated response
    automatedActions: [{
        action: { type: String },
        timestamp: { type: Date, default: Date.now },
        success: { type: Boolean },
        details: { type: String }
    }],
    // Escalation
    escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    escalatedAt: {
        type: Date
    },
    escalationReason: {
        type: String,
        trim: true
    },
    // Additional metadata
    metadata: {
        source: { type: String, default: 'SYSTEM' },
        correlationId: { type: String },
        requestId: { type: String },
        version: { type: String, default: '1.0' },
        additionalData: { type: mongoose.Schema.Types.Mixed }
    }
}, {
    timestamps: true,
    collection: 'security_events'
})

// Indexes for performance
securityEventSchema.index({ eventType: 1 })
securityEventSchema.index({ severity: 1 })
securityEventSchema.index({ status: 1 })
securityEventSchema.index({ userId: 1 })
securityEventSchema.index({ ipAddress: 1 })
securityEventSchema.index({ timestamp: -1 })
securityEventSchema.index({ riskScore: -1 })
securityEventSchema.index({ electionId: 1 })
securityEventSchema.index({ positionId: 1 })

// Compound indexes
securityEventSchema.index({ eventType: 1, severity: 1 })
securityEventSchema.index({ status: 1, timestamp: -1 })
securityEventSchema.index({ userId: 1, timestamp: -1 })
securityEventSchema.index({ ipAddress: 1, timestamp: -1 })

// Virtual for event age
securityEventSchema.virtual('age').get(function () {
    return Date.now() - this.createdAt.getTime()
})

// Virtual for is urgent
securityEventSchema.virtual('isUrgent').get(function () {
    return this.severity === 'CRITICAL' || this.riskScore >= 80
})

// Static methods
securityEventSchema.statics.findByType = function (eventType, limit = 100) {
    return this.find({ eventType }).sort({ timestamp: -1 }).limit(limit)
}

securityEventSchema.statics.findBySeverity = function (severity, limit = 100) {
    return this.find({ severity }).sort({ timestamp: -1 }).limit(limit)
}

securityEventSchema.statics.findActiveEvents = function (limit = 100) {
    return this.find({ status: 'ACTIVE' }).sort({ timestamp: -1 }).limit(limit)
}

securityEventSchema.statics.findHighRiskEvents = function (limit = 100) {
    return this.find({ riskScore: { $gte: 70 } }).sort({ riskScore: -1 }).limit(limit)
}

securityEventSchema.statics.findByIP = function (ipAddress, limit = 100) {
    return this.find({ ipAddress }).sort({ timestamp: -1 }).limit(limit)
}

securityEventSchema.statics.findByUser = function (userId, limit = 100) {
    return this.find({ userId }).sort({ timestamp: -1 }).limit(limit)
}

securityEventSchema.statics.getSecurityStatistics = function (timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)
    return this.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
            $group: {
                _id: null,
                totalEvents: { $sum: 1 },
                criticalEvents: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } },
                highEvents: { $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] } },
                activeEvents: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
                resolvedEvents: { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } },
                avgRiskScore: { $avg: '$riskScore' },
                uniqueIPs: { $addToSet: '$ipAddress' },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                _id: 0,
                totalEvents: 1,
                criticalEvents: 1,
                highEvents: 1,
                activeEvents: 1,
                resolvedEvents: 1,
                avgRiskScore: 1,
                uniqueIPs: { $size: '$uniqueIPs' },
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        }
    ])
}

securityEventSchema.statics.getEventTypeStatistics = function (timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)
    return this.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
            $group: {
                _id: '$eventType',
                count: { $sum: 1 },
                avgRiskScore: { $avg: '$riskScore' },
                maxRiskScore: { $max: '$riskScore' },
                criticalCount: { $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] } }
            }
        },
        {
            $project: {
                _id: 0,
                eventType: '$_id',
                count: 1,
                avgRiskScore: 1,
                maxRiskScore: 1,
                criticalCount: 1
            }
        },
        { $sort: { count: -1 } }
    ])
}

// Instance methods
securityEventSchema.methods.calculateRiskScore = function () {
    let score = 0

    // Base score from severity
    const severityScores = { 'LOW': 20, 'MEDIUM': 40, 'HIGH': 70, 'CRITICAL': 90 }
    score += severityScores[this.severity] || 0

    // Adjust based on event type
    const highRiskTypes = ['SYSTEM_INTRUSION', 'DATA_BREACH_ATTEMPT', 'VOTE_MANIPULATION_ATTEMPT', 'ADMIN_PRIVILEGE_ESCALATION']
    if (highRiskTypes.includes(this.eventType)) score += 15

    // Adjust based on frequency (if multiple events from same IP/user)
    // This would require additional queries in a real implementation
    score += 10

    // Adjust based on time (off-hours activity)
    const hour = new Date(this.timestamp).getHours()
    if (hour < 6 || hour > 22) score += 10

    // Adjust based on location (if available)
    if (this.location && this.location.country) {
        // Add logic for suspicious locations
        score += 5
    }

    this.riskScore = Math.min(100, score)
    return this.riskScore
}

securityEventSchema.methods.startInvestigation = function (investigatedBy, notes) {
    this.status = 'INVESTIGATING'
    this.investigatedBy = investigatedBy
    this.investigationNotes = notes
    this.investigationStartedAt = new Date()
    return this.save()
}

securityEventSchema.methods.completeInvestigation = function (resolution, resolvedBy, notes) {
    this.status = resolution
    this.resolvedBy = resolvedBy
    this.resolutionNotes = notes
    this.resolvedAt = new Date()
    this.investigationCompletedAt = new Date()
    return this.save()
}

securityEventSchema.methods.escalate = function (escalatedTo, reason) {
    this.escalatedTo = escalatedTo
    this.escalatedAt = new Date()
    this.escalationReason = reason
    this.status = 'ESCALATED'
    return this.save()
}

securityEventSchema.methods.addAutomatedAction = function (action, success, details) {
    this.automatedActions.push({
        action,
        success,
        details,
        timestamp: new Date()
    })
    return this.save()
}

securityEventSchema.methods.getEventSummary = function () {
    return {
        id: this._id,
        eventType: this.eventType,
        severity: this.severity,
        status: this.status,
        riskScore: this.riskScore,
        description: this.description,
        ipAddress: this.ipAddress,
        userId: this.userId,
        electionId: this.electionId,
        timestamp: this.timestamp,
        age: this.age,
        isUrgent: this.isUrgent
    }
}

// Pre-save middleware
securityEventSchema.pre('save', function (next) {
    // Calculate risk score
    this.calculateRiskScore()

    // Set default timestamp
    if (!this.timestamp) {
        this.timestamp = new Date()
    }

    next()
})

const securityEvent = mongoose.model('SecurityEvent', securityEventSchema)

module.exports = securityEvent
