const mongoose = require('mongoose')

const loginLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    email: {
        type: String,
        required: true,
        index: true
    },
    success: {
        type: Boolean,
        required: true,
        default: true
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    deviceInfo: {
        type: mongoose.Schema.Types.Mixed
    },
    failureReason: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true,
    collection: 'login_logs'
})



// Static method to get login stats
loginLogSchema.statics.getLoginStats = async function (startDate, endDate) {
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
                totalLogins: { $sum: 1 },
                successfulLogins: {
                    $sum: { $cond: ['$success', 1, 0] }
                },
                failedLogins: {
                    $sum: { $cond: ['$success', 0, 1] }
                },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                _id: 0,
                totalLogins: 1,
                successfulLogins: 1,
                failedLogins: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        }
    ])

    if (stats.length === 0) {
        return {
            totalLogins: 0,
            successfulLogins: 0,
            failedLogins: 0,
            uniqueUsers: 0,
            averagePerDay: 0
        }
    }

    const result = stats[0]
    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)))
    result.averagePerDay = Math.round((result.totalLogins / days) * 100) / 100

    return result
}

// Static method to get logins by date
loginLogSchema.statics.getLoginsByDate = async function (startDate, endDate) {
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
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 },
                successful: {
                    $sum: { $cond: ['$success', 1, 0] }
                },
                failed: {
                    $sum: { $cond: ['$success', 0, 1] }
                }
            }
        },
        { $sort: { _id: 1 } }
    ])
}

const LoginLog = mongoose.model('LoginLog', loginLogSchema)

module.exports = LoginLog

