const mongoose = require('mongoose')

const associationSchema = new mongoose.Schema({
    // Basic information
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    shortName: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // Association type
    type: {
        type: String,
        required: true,
        enum: [
            'STUDENT_CLUB',              // Student clubs and organizations
            'PROFESSIONAL_ASSOCIATION',  // Professional associations (e.g., Medical Association, Bar Association)
            'ACADEMIC_SOCIETY',          // Academic societies
            'CULTURAL_GROUP',            // Cultural organizations
            'SPORTS_CLUB',               // Sports clubs
            'RELIGIOUS_GROUP',           // Religious organizations
            'POLITICAL_GROUP',           // Political groups
            'CHARITY_ORGANIZATION',      // Charity/volunteer groups
            'ALUMNI_ASSOCIATION',        // Alumni groups
            'TRADE_UNION',              // Trade unions
            'BUSINESS_ASSOCIATION',      // Business associations
            'CUSTOM'                     // Custom type
        ],
        default: 'STUDENT_CLUB'
    },
    // Parent organization (can belong to school)
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School'
    },
    // Professional association details (for professional associations)
    professionalInfo: {
        profession: { type: String }, // e.g., "Medicine", "Law", "Pharmacy"
        licenseRequired: { type: Boolean, default: false },
        licenseTypes: [{ type: String }],
        certificationBody: { type: String }
    },
    // Leadership
    leadership: {
        president: {
            name: { type: String },
            email: { type: String },
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        vicePresident: {
            name: { type: String },
            email: { type: String },
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        secretary: {
            name: { type: String },
            email: { type: String },
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        treasurer: {
            name: { type: String },
            email: { type: String },
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }
    },
    // Contact information
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    // Membership settings
    membershipSettings: {
        isOpen: { type: Boolean, default: true },
        requiresApproval: { type: Boolean, default: false },
        membershipFee: { type: Number, default: 0 },
        membershipTypes: [{
            name: { type: String },
            fee: { type: Number },
            privileges: [{ type: String }]
        }],
        eligibilityCriteria: {
            minAge: { type: Number },
            maxAge: { type: Number },
            requiredProfession: { type: String },
            requiredLicense: { type: Boolean },
            customCriteria: { type: mongoose.Schema.Types.Mixed }
        }
    },
    // Statistics
    statistics: {
        totalMembers: { type: Number, default: 0 },
        activeMembers: { type: Number, default: 0 },
        totalElections: { type: Number, default: 0 },
        activeElections: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    },
    // Status
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'],
        default: 'PENDING_APPROVAL'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: {
        type: Date
    },
    // Audit fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    collection: 'associations'
})

// Indexes
associationSchema.index({ code: 1 })
associationSchema.index({ name: 1 })
associationSchema.index({ schoolId: 1 })
associationSchema.index({ type: 1 })
associationSchema.index({ status: 1 })
associationSchema.index({ isActive: 1 })
associationSchema.index({ 'professionalInfo.profession': 1 })

associationSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true })


associationSchema.virtual('displayName').get(function () {
    return this.shortName || this.name
})

associationSchema.statics.findBySchool = function (schoolId) {
    return this.find({ schoolId, isActive: true }).sort({ name: 1 })
}

associationSchema.statics.findByType = function (type, schoolId = null) {
    const query = { type, isActive: true }
    if (schoolId) query.schoolId = schoolId
    return this.find(query).sort({ name: 1 })
}

associationSchema.statics.findProfessionalAssociations = function (profession = null) {
    const query = { type: 'PROFESSIONAL_ASSOCIATION', isActive: true }
    if (profession) {
        query['professionalInfo.profession'] = profession
    }
    return this.find(query).sort({ name: 1 })
}

// Instance methods
associationSchema.methods.updateStatistics = function () {
    this.statistics.lastUpdated = new Date()
    return this.save()
}

associationSchema.methods.verifyAssociation = function (verifiedBy) {
    this.isVerified = true
    this.verifiedBy = verifiedBy
    this.verifiedAt = new Date()
    this.status = 'ACTIVE'
    return this.save()
}

associationSchema.methods.getAssociationSummary = function () {
    return {
        id: this._id,
        name: this.name,
        code: this.code,
        type: this.type,
        schoolId: this.schoolId,
        status: this.status,
        isVerified: this.isVerified,
        statistics: this.statistics
    }
}

// Pre-save middleware
associationSchema.pre('save', function (next) {
    // Ensure code is uppercase
    if (this.code) {
        this.code = this.code.toUpperCase()
    }

    // Set updatedBy if not set
    if (this.isModified() && !this.updatedBy) {
        this.updatedBy = this.createdBy
    }

    next()
})

const association = mongoose.model('Association', associationSchema)

module.exports = association

