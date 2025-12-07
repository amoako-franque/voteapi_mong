const mongoose = require('mongoose')

const schoolSchema = new mongoose.Schema({
    // Basic information
    name: {
        type: String,
        required: true,
        trim: true
    },
    shortName: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: [
            'PRIMARY_SCHOOL',
            'SECONDARY_SCHOOL',
            'HIGH_SCHOOL',
            'UNIVERSITY',
            'COLLEGE',
            'TECHNICAL_INSTITUTE',
            'VOCATIONAL_SCHOOL',
            'GRADUATE_SCHOOL',
            'POLYTECHNIC',
            'TEACHERS_TRAINING_COLLEGE',
            'NURSING_SCHOOL',
            'LAW_SCHOOL',
            'MEDICAL_SCHOOL'
        ]
    },
    description: {
        type: String,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    // Contact information
    website: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    fax: {
        type: String,
        trim: true
    },
    // Address information
    address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        country: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        coordinates: {
            latitude: { type: Number },
            longitude: { type: Number }
        }
    },
    // Academic information
    academicInfo: {
        establishedYear: { type: Number },
        accreditation: [{ type: String }],
        academicCalendar: {
            startMonth: { type: String },
            endMonth: { type: String },
            semesterSystem: { type: Boolean, default: false },
            trimesterSystem: { type: Boolean, default: false },
            quarterSystem: { type: Boolean, default: false }
        },
        gradingSystem: {
            type: { type: String, enum: ['LETTER', 'PERCENTAGE', 'GPA', 'CUSTOM'] },
            scale: { type: String },
            passingGrade: { type: String }
        },
        programs: [{
            name: { type: String },
            level: { type: String },
            duration: { type: String },
            department: { type: String }
        }]
    },
    // Election settings and configuration
    electionSettings: {
        allowStudentElections: { type: Boolean, default: true },
        allowDepartmentElections: { type: Boolean, default: true },
        allowAssociationElections: { type: Boolean, default: true },
        electionDeadlines: {
            registrationPeriod: { type: Number, default: 14 }, // days
            nominationPeriod: { type: Number, default: 7 }, // days
            campaignPeriod: { type: Number, default: 14 }, // days
            votingPeriod: { type: Number, default: 1 } // days
        },
        votingRules: {
            allowOnlineVoting: { type: Boolean, default: true },
            allowOfflineVoting: { type: Boolean, default: false },
            requireVoterVerification: { type: Boolean, default: true },
            allowProxyVoting: { type: Boolean, default: false },
            maxVotingAttempts: { type: Number, default: 3 }
        },
        candidateRequirements: {
            minAge: { type: Number },
            maxAge: { type: Number },
            minGPA: { type: Number },
            requiredYearOfStudy: [{ type: String }],
            requiredDepartments: [{ type: String }],
            customCriteria: { type: mongoose.Schema.Types.Mixed }
        }
    },

    // Department and organizational structure
    organizationalStructure: {
        departments: [{
            name: { type: String },
            code: { type: String },
            head: { type: String },
            description: { type: String }
        }],
        faculties: [{
            name: { type: String },
            dean: { type: String },
            departments: [{ type: String }]
        }],
        studentOrganizations: [{
            name: { type: String },
            type: { type: String },
            president: { type: String },
            description: { type: String }
        }]
    },
    // Statistics and metrics
    statistics: {
        totalStudents: { type: Number, default: 0 },
        totalStaff: { type: Number, default: 0 },
        totalDepartments: { type: Number, default: 0 },
        totalAssociations: { type: Number, default: 0 },
        totalElections: { type: Number, default: 0 },
        activeElections: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    },



    // Status and metadata
    status: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'MAINTENANCE'],
        default: 'ACTIVE'
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
    // Additional metadata
    logo: {
        type: String
    },
    banner: {
        type: String
    },
    colors: {
        primary: { type: String },
        secondary: { type: String },
        accent: { type: String }
    },
    // Audit fields
    addedBy: {
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
    collection: 'schools'
})

// Indexes for performance
schoolSchema.index({ name: 1 })
schoolSchema.index({ type: 1 })
schoolSchema.index({ status: 1 })
schoolSchema.index({ isActive: 1 })
schoolSchema.index({ 'address.city': 1 })
schoolSchema.index({ 'address.state': 1 })
schoolSchema.index({ 'address.country': 1 })
schoolSchema.index({ addedBy: 1 })

// Virtual for display name
schoolSchema.virtual('displayName').get(function () {
    return this.shortName || this.name
})

// Virtual for full address
schoolSchema.virtual('fullAddress').get(function () {
    const addr = this.address
    if (!addr) return ''

    const parts = []
    if (addr.street) parts.push(addr.street)
    if (addr.city) parts.push(addr.city)
    if (addr.state) parts.push(addr.state)
    if (addr.country) parts.push(addr.country)
    if (addr.postalCode) parts.push(addr.postalCode)

    return parts.join(', ')
})

// Static methods
schoolSchema.statics.findByType = function (type) {
    return this.find({ type, isActive: true })
}

schoolSchema.statics.findByLocation = function (city, state, country) {
    const query = { isActive: true }
    if (city) query['address.city'] = city
    if (state) query['address.state'] = state
    if (country) query['address.country'] = country
    return this.find(query)
}

schoolSchema.statics.findActiveSchools = function () {
    return this.find({ isActive: true, status: 'ACTIVE' })
}

schoolSchema.statics.findVerifiedSchools = function () {
    return this.find({ isActive: true, isVerified: true })
}

schoolSchema.statics.searchSchools = function (searchTerm) {
    return this.find({
        isActive: true,
        $or: [
            { name: { $regex: searchTerm, $options: 'i' } },
            { shortName: { $regex: searchTerm, $options: 'i' } },
            { code: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } }
        ]
    })
}

// Instance methods
schoolSchema.methods.updateStatistics = function () {
    // This would be called with actual counts from other collections
    this.statistics.lastUpdated = new Date()
    return this.save()
}

schoolSchema.methods.canConductElections = function () {
    return this.isActive && this.isVerified && this.electionSettings.allowStudentElections
}

schoolSchema.methods.getElectionSettings = function () {
    return {
        allowStudentElections: this.electionSettings.allowStudentElections,
        allowDepartmentElections: this.electionSettings.allowDepartmentElections,
        allowAssociationElections: this.electionSettings.allowAssociationElections,
        electionDeadlines: this.electionSettings.electionDeadlines,
        votingRules: this.electionSettings.votingRules,
        candidateRequirements: this.electionSettings.candidateRequirements
    }
}

schoolSchema.methods.getVoterRegistrationSettings = function () {
    return {
        autoRegisterStudents: this.voterRegistrationSettings.autoRegisterStudents,
        requireVerification: this.voterRegistrationSettings.requireVerification,
        verificationMethods: this.voterRegistrationSettings.verificationMethods,
        registrationDeadlines: this.voterRegistrationSettings.registrationDeadlines,
        eligibilityCriteria: this.voterRegistrationSettings.eligibilityCriteria
    }
}

schoolSchema.methods.addDepartment = function (department) {
    this.organizationalStructure.departments.push(department)
    this.statistics.totalDepartments = this.organizationalStructure.departments.length
    return this.save()
}

schoolSchema.methods.removeDepartment = function (departmentCode) {
    this.organizationalStructure.departments = this.organizationalStructure.departments.filter(
        dept => dept.code !== departmentCode
    )
    this.statistics.totalDepartments = this.organizationalStructure.departments.length
    return this.save()
}

schoolSchema.methods.addStudentOrganization = function (organization) {
    this.organizationalStructure.studentOrganizations.push(organization)
    this.statistics.totalAssociations = this.organizationalStructure.studentOrganizations.length
    return this.save()
}

schoolSchema.methods.verifySchool = function (verifiedBy) {
    this.isVerified = true
    this.verifiedBy = verifiedBy
    this.verifiedAt = new Date()
    return this.save()
}

schoolSchema.methods.suspendSchool = function (reason, suspendedBy) {
    this.status = 'SUSPENDED'
    this.isActive = false
    this.updatedBy = suspendedBy
    return this.save()
}

schoolSchema.methods.reactivateSchool = function (reactivatedBy) {
    this.status = 'ACTIVE'
    this.isActive = true
    this.updatedBy = reactivatedBy
    return this.save()
}

schoolSchema.methods.getSchoolSummary = function () {
    return {
        id: this._id,
        name: this.name,
        shortName: this.shortName,
        code: this.code,
        type: this.type,
        status: this.status,
        isActive: this.isActive,
        isVerified: this.isVerified,
        fullAddress: this.fullAddress,
        statistics: this.statistics,
        electionSettings: this.getElectionSettings(),
        voterRegistrationSettings: this.getVoterRegistrationSettings()
    }
}

// Pre-save middleware
schoolSchema.pre('save', function (next) {
    // Ensure code is uppercase
    if (this.code) {
        this.code = this.code.toUpperCase()
    }

    // Set updatedBy if not set
    if (this.isModified() && !this.updatedBy) {
        this.updatedBy = this.addedBy
    }

    // Update statistics counts
    if (this.isModified('organizationalStructure.departments')) {
        this.statistics.totalDepartments = this.organizationalStructure.departments.length
    }

    if (this.isModified('organizationalStructure.studentOrganizations')) {
        this.statistics.totalAssociations = this.organizationalStructure.studentOrganizations.length
    }

    next()
})

const school = mongoose.model('School', schoolSchema)

module.exports = school
