const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
    // User and session information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sessionId: {
        type: String
    },
    // Action details
    action: {
        type: String,
        required: true,
        enum: [
            // Election actions
            'ELECTION_CREATED', 'ELECTION_UPDATED', 'ELECTION_DELETED', 'ELECTION_PHASE_CHANGED',
            // Voter actions
            'VOTER_REGISTERED', 'VOTER_UPDATED', 'VOTER_DELETED', 'VOTER_ELIGIBILITY_CHECKED',
            // Candidate actions
            'CANDIDATE_REGISTERED', 'CANDIDATE_APPROVED', 'CANDIDATE_REJECTED', 'CANDIDATE_WITHDRAWN',
            // Vote actions
            'VOTE_CAST', 'VOTE_VERIFIED', 'VOTE_DISPUTED', 'VOTE_INVALIDATED',
            // Secret code actions
            'SECRET_CODE_GENERATED', 'SECRET_CODE_USED', 'SECRET_CODE_FAILED', 'SECRET_CODE_DEACTIVATED',
            // Access control actions
            'ACCESS_GRANTED', 'ACCESS_REVOKED', 'ACCESS_SUSPENDED', 'ACCESS_REACTIVATED',
            // Admin actions
            'ADMIN_LOGIN', 'ADMIN_LOGOUT', 'ADMIN_PERMISSION_CHANGED', 'ADMIN_ROLE_CHANGED',
            // Security actions
            'SECURITY_EVENT', 'SUSPICIOUS_ACTIVITY', 'FAILED_LOGIN', 'ACCOUNT_LOCKED',
            // System actions
            'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'SYSTEM_UPDATE', 'SYSTEM_MAINTENANCE',
            // Custom actions
            'CUSTOM_ACTION'
        ]
    },
    resourceType: {
        type: String,
        enum: ['ELECTION', 'VOTER', 'CANDIDATE', 'VOTE', 'POSITION', 'SECRET_CODE', 'ACCESS', 'USER', 'SYSTEM', 'SECURITY'],
        required: true
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    // Action details
    details: {
        type: mongoose.Schema.Types.Mixed
    },
    // Success/failure status
    success: {
        type: Boolean,
        required: true
    },
    errorMessage: {
        type: String,
        trim: true
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
        }
    },
    // Risk assessment
    riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'LOW'
    },
    riskScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    // Position and election specific (for voting actions)
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
    // Timing information
    timestamp: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number // milliseconds
    },
    // Additional metadata
    metadata: {
        requestId: { type: String },
        correlationId: { type: String },
        version: { type: String },
        environment: { type: String },
        additionalData: { type: mongoose.Schema.Types.Mixed }
    }
}, {
    timestamps: true,
    collection: 'audit_logs'
})

// Indexes for performance
auditLogSchema.index({ userId: 1 })
auditLogSchema.index({ action: 1 })
auditLogSchema.index({ resourceType: 1 })
auditLogSchema.index({ resourceId: 1 })
auditLogSchema.index({ success: 1 })
auditLogSchema.index({ riskLevel: 1 })
auditLogSchema.index({ ipAddress: 1 })
auditLogSchema.index({ electionId: 1 })
auditLogSchema.index({ positionId: 1 })



// Virtual for action category
auditLogSchema.virtual('actionCategory').get(function () {
    const categories = {
        'ELECTION_CREATED': 'ELECTION',
        'ELECTION_UPDATED': 'ELECTION',
        'ELECTION_DELETED': 'ELECTION',
        'ELECTION_PHASE_CHANGED': 'ELECTION',
        'VOTER_REGISTERED': 'VOTER',
        'VOTER_UPDATED': 'VOTER',
        'VOTER_DELETED': 'VOTER',
        'VOTER_ELIGIBILITY_CHECKED': 'VOTER',
        'CANDIDATE_REGISTERED': 'CANDIDATE',
        'CANDIDATE_APPROVED': 'CANDIDATE',
        'CANDIDATE_REJECTED': 'CANDIDATE',
        'CANDIDATE_WITHDRAWN': 'CANDIDATE',
        'VOTE_CAST': 'VOTE',
        'VOTE_VERIFIED': 'VOTE',
        'VOTE_DISPUTED': 'VOTE',
        'VOTE_INVALIDATED': 'VOTE',
        'SECRET_CODE_GENERATED': 'SECURITY',
        'SECRET_CODE_USED': 'SECURITY',
        'SECRET_CODE_FAILED': 'SECURITY',
        'SECRET_CODE_DEACTIVATED': 'SECURITY',
        'ACCESS_GRANTED': 'ACCESS',
        'ACCESS_REVOKED': 'ACCESS',
        'ACCESS_SUSPENDED': 'ACCESS',
        'ACCESS_REACTIVATED': 'ACCESS',
        'ADMIN_LOGIN': 'ADMIN',
        'ADMIN_LOGOUT': 'ADMIN',
        'ADMIN_PERMISSION_CHANGED': 'ADMIN',
        'ADMIN_ROLE_CHANGED': 'ADMIN',
        'SECURITY_EVENT': 'SECURITY',
        'SUSPICIOUS_ACTIVITY': 'SECURITY',
        'FAILED_LOGIN': 'SECURITY',
        'ACCOUNT_LOCKED': 'SECURITY',
        'SYSTEM_BACKUP': 'SYSTEM',
        'SYSTEM_RESTORE': 'SYSTEM',
        'SYSTEM_UPDATE': 'SYSTEM',
        'SYSTEM_MAINTENANCE': 'SYSTEM'
    }
    return categories[this.action] || 'OTHER'
})

// Static methods
auditLogSchema.statics.findByUser = function (userId, limit = 100) {
    return this.find({ userId }).sort({ timestamp: -1 }).limit(limit)
}

auditLogSchema.statics.findByAction = function (action, limit = 100) {
    return this.find({ action }).sort({ timestamp: -1 }).limit(limit)
}

auditLogSchema.statics.findByResource = function (resourceType, resourceId) {
    return this.find({ resourceType, resourceId }).sort({ timestamp: -1 })
}

auditLogSchema.statics.findByElection = function (electionId, limit = 100) {
    return this.find({ electionId }).sort({ timestamp: -1 }).limit(limit)
}

auditLogSchema.statics.findFailedActions = function (limit = 100) {
    return this.find({ success: false }).sort({ timestamp: -1 }).limit(limit)
}

auditLogSchema.statics.findHighRiskActions = function (limit = 100) {
    return this.find({ riskLevel: { $in: ['HIGH', 'CRITICAL'] } }).sort({ timestamp: -1 }).limit(limit)
}

auditLogSchema.statics.findSuspiciousActivity = function (timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)
    return this.find({
        timestamp: { $gte: since },
        $or: [
            { riskLevel: { $in: ['HIGH', 'CRITICAL'] } },
            { action: { $in: ['SUSPICIOUS_ACTIVITY', 'FAILED_LOGIN', 'SECRET_CODE_FAILED'] } }
        ]
    }).sort({ timestamp: -1 })
}

auditLogSchema.statics.getAuditStatistics = function (timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)
    return this.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
            $group: {
                _id: null,
                totalActions: { $sum: 1 },
                successfulActions: { $sum: { $cond: ['$success', 1, 0] } },
                failedActions: { $sum: { $cond: ['$success', 0, 1] } },
                highRiskActions: { $sum: { $cond: [{ $in: ['$riskLevel', ['HIGH', 'CRITICAL']] }, 1, 0] } },
                uniqueUsers: { $addToSet: '$userId' },
                uniqueIPs: { $addToSet: '$ipAddress' }
            }
        },
        {
            $project: {
                _id: 0,
                totalActions: 1,
                successfulActions: 1,
                failedActions: 1,
                highRiskActions: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                uniqueIPs: { $size: '$uniqueIPs' },
                successRate: { $multiply: [{ $divide: ['$successfulActions', '$totalActions'] }, 100] }
            }
        }
    ])
}

auditLogSchema.statics.getActionStatistics = function (timeframe = 24) {
    const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)
    return this.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
            $group: {
                _id: '$action',
                count: { $sum: 1 },
                successCount: { $sum: { $cond: ['$success', 1, 0] } },
                failureCount: { $sum: { $cond: ['$success', 0, 1] } },
                avgRiskScore: { $avg: '$riskScore' }
            }
        },
        {
            $project: {
                _id: 0,
                action: '$_id',
                count: 1,
                successCount: 1,
                failureCount: 1,
                avgRiskScore: 1,
                successRate: { $multiply: [{ $divide: ['$successCount', '$count'] }, 100] }
            }
        },
        { $sort: { count: -1 } }
    ])
}

// Instance methods
auditLogSchema.methods.calculateRiskScore = function () {
    let score = 0

    // Base score from risk level
    const riskScores = { 'LOW': 10, 'MEDIUM': 30, 'HIGH': 70, 'CRITICAL': 90 }
    score += riskScores[this.riskLevel] || 0

    // Adjust based on action type
    const highRiskActions = ['VOTE_CAST', 'SECRET_CODE_USED', 'ADMIN_LOGIN', 'ACCESS_GRANTED']
    if (highRiskActions.includes(this.action)) score += 10

    // Adjust based on success/failure
    if (!this.success) score += 20

    // Adjust based on time (off-hours activity)
    const hour = new Date(this.timestamp).getHours()
    if (hour < 6 || hour > 22) score += 15

    // Adjust based on location (if available)
    if (this.location && this.location.country) {
        // Add logic for suspicious locations
        score += 5
    }

    this.riskScore = Math.min(100, score)
    return this.riskScore
}

auditLogSchema.methods.isSuspicious = function () {
    return this.riskScore >= 70 || this.riskLevel === 'HIGH' || this.riskLevel === 'CRITICAL'
}

auditLogSchema.methods.getAuditSummary = function () {
    return {
        id: this._id,
        userId: this.userId,
        action: this.action,
        resourceType: this.resourceType,
        resourceId: this.resourceId,
        success: this.success,
        riskLevel: this.riskLevel,
        riskScore: this.riskScore,
        timestamp: this.timestamp,
        ipAddress: this.ipAddress,
        electionId: this.electionId,
        positionId: this.positionId
    }
}

// Pre-save middleware
auditLogSchema.pre('save', function (next) {
    // Calculate risk score
    this.calculateRiskScore()

    // Set default values
    if (!this.timestamp) {
        this.timestamp = new Date()
    }

    next()
})

const auditLog = mongoose.model('AuditLog', auditLogSchema)

module.exports = auditLog
