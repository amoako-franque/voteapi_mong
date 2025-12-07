const mongoose = require('mongoose')

const apiRequestLogSchema = new mongoose.Schema({
    method: {
        type: String,
        required: true,
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        index: true
    },
    path: {
        type: String,
        required: true,
        index: true
    },
    endpoint: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    ipAddress: {
        type: String,
        index: true
    },
    userAgent: {
        type: String
    },
    statusCode: {
        type: Number,
        required: true,
        index: true
    },
    responseTime: {
        type: Number, // milliseconds
        required: true
    },
    requestSize: {
        type: Number // bytes
    },
    responseSize: {
        type: Number // bytes
    },
    error: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'api_request_logs'
})

// Indexes for analytics queries
apiRequestLogSchema.index({ userId: 1, timestamp: -1 })
apiRequestLogSchema.index({ endpoint: 1, timestamp: -1 })
apiRequestLogSchema.index({ statusCode: 1, timestamp: -1 })
apiRequestLogSchema.index({ method: 1, timestamp: -1 })

// TTL index to auto-delete old logs (90 days) - this also serves as the timestamp index
apiRequestLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

// Static method to get API usage stats
apiRequestLogSchema.statics.getApiUsageStats = async function (startDate, endDate) {
    const matchStage = {
        timestamp: {
            $gte: startDate,
            $lte: endDate
        }
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                successfulRequests: {
                    $sum: {
                        $cond: [
                            { $and: [{ $gte: ['$statusCode', 200] }, { $lt: ['$statusCode', 300] }] },
                            1,
                            0
                        ]
                    }
                },
                failedRequests: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                },
                uniqueUsers: { $addToSet: '$userId' },
                totalResponseTime: { $sum: '$responseTime' },
                avgResponseTime: { $avg: '$responseTime' }
            }
        },
        {
            $project: {
                _id: 0,
                totalRequests: 1,
                successfulRequests: 1,
                failedRequests: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                totalResponseTime: 1,
                avgResponseTime: { $round: ['$avgResponseTime', 2] }
            }
        }
    ])

    if (stats.length === 0) {
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            uniqueUsers: 0,
            avgResponseTime: 0,
            averagePerDay: 0
        }
    }

    const result = stats[0]
    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
    result.averagePerDay = Math.round((result.totalRequests / days) * 100) / 100

    return result
}

// Static method to get requests by endpoint
apiRequestLogSchema.statics.getRequestsByEndpoint = async function (startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: '$endpoint',
                count: { $sum: 1 },
                avgResponseTime: { $avg: '$responseTime' },
                errors: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
                }
            }
        },
        { $sort: { count: -1 } }
    ])
}

const ApiRequestLog = mongoose.model('ApiRequestLog', apiRequestLogSchema)

module.exports = ApiRequestLog

