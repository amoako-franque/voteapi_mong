const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minLength: [8, "Password must have at least 8 characters."],
        select: false
    },
    firstname: {
        type: String,
        required: true,
        trim: true
    },
    lastname: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        unique: true,
        trim: true,
        sparse: true
    },
    phone: {
        type: String,
        trim: true,
        maxlength: [15, "Phone number cannot have more than 15 characters."],
        minlength: [10, "Phone number cannot have less than 10 characters."],
        required: true,
        unique: true,
        validate: {
            validator: function (v) {
                return /^[\+]?[1-9][\d]{0,15}$/.test(v)
            },
            message: 'Phone number must be a valid number'
        }
    },

    // Role & Permissions
    role: {
        type: String,
        required: true,
        enum: [
            'SUPER_ADMIN',                  // Platform management
            'ADMIN',                        // Platform administration
            'SCHOOL_ADMIN',                 // School management
            'ASSOCIATION_ADMIN',            // Association management
            'PROFESSIONAL_ASSOCIATION_ADMIN', // Professional association management
            'ELECTION_OFFICER'              // Election management
        ]
    },

    permissions: {
        // Platform permissions
        canManagePlatform: { type: Boolean, default: false },
        canManageAdmins: { type: Boolean, default: false },
        canManageSystemSettings: { type: Boolean, default: false },

        // School permissions
        canManageSchools: { type: Boolean, default: false },
        canManageAssociations: { type: Boolean, default: false },

        // Election permissions
        canCreateElection: { type: Boolean, default: false },
        canApproveCandidates: { type: Boolean, default: false },
        canManageVoters: { type: Boolean, default: false },
        canViewResults: { type: Boolean, default: false },
        canOverrideEligibility: { type: Boolean, default: false },
        canResolveDisputes: { type: Boolean, default: false },

        // System permissions
        canAccessAuditLogs: { type: Boolean, default: false },
        canManageElectionOfficers: { type: Boolean, default: false }
    },

    // Scope (for school-based roles)
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        default: null
    },
    associationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Association',
        default: null
    },

    // Status & Security
    isActive: {
        type: Boolean,
        default: true
    },
    verified: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },

    // Password reset
    passwordResetToken: {
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        select: false
    },

    // Two-factor authentication
    twoFactorSecret: {
        type: String,
        select: false
    },
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },

    // Suspension/Activation tracking
    suspendedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    suspendedAt: {
        type: Date,
        default: null
    },
    suspensionReason: {
        type: String,
        trim: true
    },
    activatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    activatedAt: {
        type: Date,
        default: null
    },

    // Audit
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Poll statistics (separate from election system)
    pollStats: {
        pollsCreated: {
            type: Number,
            default: 0
        },
        pollsVoted: {
            type: Number,
            default: 0
        },
        lastPollCreatedAt: {
            type: Date
        }
    },

    // Notification preferences
    notificationPreferences: {
        email: {
            enabled: {
                type: Boolean,
                default: true
            },
            electionReminders: {
                type: Boolean,
                default: true
            },
            voteConfirmations: {
                type: Boolean,
                default: true
            },
            resultsAvailable: {
                type: Boolean,
                default: true
            },
            deadlineReminders: {
                type: Boolean,
                default: true
            },
            pollResults: {
                type: Boolean,
                default: true
            },
            systemAlerts: {
                type: Boolean,
                default: true
            }
        },
        sms: {
            enabled: {
                type: Boolean,
                default: false
            },
            electionReminders: {
                type: Boolean,
                default: false
            },
            voteConfirmations: {
                type: Boolean,
                default: false
            },
            deadlineReminders: {
                type: Boolean,
                default: false
            }
        },
        push: {
            enabled: {
                type: Boolean,
                default: true
            },
            electionReminders: {
                type: Boolean,
                default: true
            },
            voteConfirmations: {
                type: Boolean,
                default: true
            },
            resultsAvailable: {
                type: Boolean,
                default: true
            }
        },
        inApp: {
            enabled: {
                type: Boolean,
                default: true
            },
            allNotifications: {
                type: Boolean,
                default: true
            }
        }
    }
}, {
    timestamps: true,
    collection: 'users'
})

// Indexes for performance
userSchema.index({ role: 1 })
userSchema.index({ isActive: 1, verified: 1 })
userSchema.index({ schoolId: 1 })
userSchema.index({ associationId: 1 })

// Virtual for full name
userSchema.virtual('fullName').get(function () {
    return `${ this.firstname } ${ this.lastname }`.trim()
})

// Virtual for account lock status
userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now())
})

// Virtual for user type
userSchema.virtual('userType').get(function () {
    if (['SUPER_ADMIN', 'ADMIN'].includes(this.role)) {
        return 'platform_admin'
    }
    return 'system_user'
})

// Instance methods
userSchema.methods.incrementLoginAttempts = function () {
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: { lockUntil: 1 },
            $set: { loginAttempts: 1 }
        })
    }

    const updates = { $inc: { loginAttempts: 1 } }
    if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2 hours
    }
    return this.updateOne(updates)
}

userSchema.methods.resetLoginAttempts = function () {
    return this.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 }
    })
}

userSchema.methods.updateLastActivity = function () {
    this.lastActivity = new Date()
    return this.save()
}

// Pre-save middleware to set permissions based on role
userSchema.pre('save', function (next) {
    if (this.isNew) {
        switch (this.role) {
            case 'SUPER_ADMIN':
                this.permissions = {
                    canManagePlatform: true,
                    canManageAdmins: true,
                    canManageSystemSettings: true,
                    canManageSchools: true,
                    canManageAssociations: true,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: true,
                    canResolveDisputes: true,
                    canAccessAuditLogs: true,
                    canManageElectionOfficers: true
                }
                break

            case 'ADMIN':
                this.permissions = {
                    canManagePlatform: true,
                    canManageAdmins: false,
                    canManageSystemSettings: false,
                    canManageSchools: true,
                    canManageAssociations: true,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: true,
                    canResolveDisputes: true,
                    canAccessAuditLogs: true,
                    canManageElectionOfficers: true
                }
                break

            case 'SCHOOL_ADMIN':
                this.permissions = {
                    canManagePlatform: false,
                    canManageAdmins: false,
                    canManageSystemSettings: false,
                    canManageSchools: true,
                    canManageAssociations: false,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: false,
                    canResolveDisputes: true,
                    canAccessAuditLogs: false,
                    canManageElectionOfficers: true
                }
                break

            case 'ASSOCIATION_ADMIN':
                this.permissions = {
                    canManagePlatform: false,
                    canManageAdmins: false,
                    canManageSystemSettings: false,
                    canManageSchools: false,
                    canManageAssociations: true,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: false,
                    canResolveDisputes: true,
                    canAccessAuditLogs: false,
                    canManageElectionOfficers: true
                }
                break

            case 'PROFESSIONAL_ASSOCIATION_ADMIN':
                this.permissions = {
                    canManagePlatform: false,
                    canManageAdmins: false,
                    canManageSystemSettings: false,
                    canManageSchools: false,
                    canManageAssociations: true,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: false,
                    canResolveDisputes: true,
                    canAccessAuditLogs: false,
                    canManageElectionOfficers: true
                }
                break

            case 'ELECTION_OFFICER':
                this.permissions = {
                    canManagePlatform: false,
                    canManageAdmins: false,
                    canManageSystemSettings: false,
                    canManageSchools: false,
                    canManageAssociations: false,
                    canCreateElection: true,
                    canApproveCandidates: true,
                    canManageVoters: true,
                    canViewResults: true,
                    canOverrideEligibility: false,
                    canResolveDisputes: false,
                    canAccessAuditLogs: false,
                    canManageElectionOfficers: false
                }
                break
        }
    }
    next()
})

const user = mongoose.model('User', userSchema)

module.exports = user
