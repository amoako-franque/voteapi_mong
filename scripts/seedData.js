const mongoose = require('mongoose')
require('dotenv').config()

// Import models
const User = require('../models/User')
const School = require('../models/School')
const Organization = require('../models/Organization')
const Department = require('../models/Department')
const Association = require('../models/Association')
const Election = require('../models/Election')
const VoterRegistry = require('../models/VoterRegistry')
const Position = require('../models/Position')
const Candidate = require('../models/Candidate')
const authService = require('../services/authService')
const crypto = require('crypto')

// Connect to database
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/voteapi'
        await mongoose.connect(mongoUri)
        console.log('✅ Connected to MongoDB')
    } catch (error) {
        console.error('❌ MongoDB connection error:', error)
        process.exit(1)
    }
}

// Generate voter ID with code prefix (matches controller logic)
const generateVoterId = async (schoolId, organizationId, schoolCode, orgCode) => {
    const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase()

    if (schoolId && organizationId && schoolCode && orgCode) {
        return `${schoolCode}-${orgCode}-${randomHex}`
    } else if (schoolId && schoolCode) {
        return `${schoolCode}-${randomHex}`
    } else if (organizationId && orgCode) {
        return `${orgCode}-${randomHex}`
    } else {
        // Fallback if codes are missing
        return `VOTER-${randomHex}`
    }
}

// Main seed function
const seedData = async () => {
    try {
        await connectDB()

        console.log('🌱 Starting seed process...\n')

        // Clear existing data (optional - comment out if you want to keep existing data)
        console.log('🗑️  Clearing existing data...')
        await User.deleteMany({ email: { $regex: /^seed\./ } })
        await School.deleteMany({ code: { $in: ['SEEDUNIV', 'SEEDCOLL', 'SEEDTECH'] } })
        await Organization.deleteMany({ code: { $in: ['SEEDNGO', 'SEEDPROF', 'SEEDCOMP'] } })
        await Department.deleteMany({ code: { $regex: /^SEED/ } })
        await Association.deleteMany({ code: { $regex: /^SEED/ } })
        await Election.deleteMany({ title: { $regex: /^Seed Election/ } })
        await VoterRegistry.deleteMany({ email: { $regex: /^seed\.voter/ } })
        await Position.deleteMany({})
        await Candidate.deleteMany({})
        console.log('✅ Existing seed data cleared\n')

        // 1. Create users for each role
        console.log('👥 Creating users...')
        const roles = [
            'SUPER_ADMIN',
            'ADMIN',
            'ORGANIZATION_ADMIN',
            'SCHOOL_ADMIN',
            'DEPARTMENT_ADMIN',
            'ASSOCIATION_ADMIN',
            'PROFESSIONAL_ASSOCIATION_ADMIN'
        ]

        const users = {}
        const defaultPassword = 'SeedPass123!'
        const hashedPassword = await authService.hashPassword(defaultPassword)

        for (const role of roles) {
            const email = `seed.${role.toLowerCase().replace(/_/g, '.')}@example.com`
            const user = await User.create({
                email,
                password: hashedPassword,
                firstname: role.split('_')[0],
                lastname: 'Admin',
                phone: `+233${Math.floor(Math.random() * 1000000000)}`,
                role,
                verified: true,
                isActive: true
            })
            users[role] = user
            console.log(`  ✓ Created ${role}: ${email}`)
        }
        console.log('✅ Users created\n')

        // 2. Create schools
        console.log('🏫 Creating schools...')
        const schools = []
        const schoolData = [
            {
                name: 'Seed University',
                shortName: 'SeedU',
                code: 'SEEDUNIV',
                type: 'UNIVERSITY',
                description: 'A seed university for testing',
                email: 'info@seeduniv.edu',
                phone: '+233241234567',
                website: 'https://seeduniv.edu',
                address: {
                    street: '123 University Avenue',
                    city: 'Accra',
                    state: 'Greater Accra',
                    country: 'Ghana',
                    postalCode: 'GA123'
                },
                isActive: true,
                isVerified: true,
                createdBy: users.SCHOOL_ADMIN._id
            },
            {
                name: 'Seed College',
                shortName: 'SeedC',
                code: 'SEEDCOLL',
                type: 'COLLEGE',
                description: 'A seed college for testing',
                email: 'info@seedcoll.edu',
                phone: '+233241234568',
                isActive: true,
                isVerified: true,
                createdBy: users.SCHOOL_ADMIN._id
            },
            {
                name: 'Seed Technical Institute',
                shortName: 'SeedTech',
                code: 'SEEDTECH',
                type: 'TECHNICAL_INSTITUTE',
                description: 'A seed technical institute for testing',
                email: 'info@seedtech.edu',
                phone: '+233241234569',
                isActive: true,
                isVerified: true,
                createdBy: users.SCHOOL_ADMIN._id
            }
        ]

        for (const data of schoolData) {
            const school = await School.create(data)
            schools.push(school)
            console.log(`  ✓ Created school: ${school.name} (${school.code})`)
        }
        console.log('✅ Schools created\n')

        // 3. Create organizations
        console.log('🏢 Creating organizations...')
        const organizations = []
        const orgData = [
            {
                name: 'Seed NGO',
                shortName: 'SeedNGO',
                code: 'SEEDNGO',
                type: 'NGO',
                description: 'A seed NGO for testing',
                email: 'info@seedngo.org',
                phone: ['+233241234570'],
                website: 'https://seedngo.org',
                address: {
                    street: '456 NGO Street',
                    city: 'Kumasi',
                    state: 'Ashanti',
                    country: 'Ghana',
                    postalCode: 'AS456'
                },
                organizationDetails: {
                    establishedYear: 2020,
                    registrationNumber: 'NGO-2020-001',
                    memberCount: 500
                },
                isActive: true,
                isVerified: true,
                createdBy: users.ORGANIZATION_ADMIN._id
            },
            {
                name: 'Seed Professional Body',
                shortName: 'SeedProf',
                code: 'SEEDPROF',
                type: 'PROFESSIONAL_BODY',
                description: 'A seed professional body for testing',
                email: 'info@seedprof.org',
                phone: ['+233241234571'],
                organizationDetails: {
                    establishedYear: 2018,
                    registrationNumber: 'PROF-2018-001',
                    memberCount: 1000
                },
                isActive: true,
                isVerified: true,
                createdBy: users.ORGANIZATION_ADMIN._id
            },
            {
                name: 'Seed Company',
                shortName: 'SeedComp',
                code: 'SEEDCOMP',
                type: 'COMPANY',
                description: 'A seed company for testing',
                email: 'info@seedcomp.com',
                phone: ['+233241234572'],
                organizationDetails: {
                    establishedYear: 2015,
                    registrationNumber: 'COMP-2015-001',
                    employeeCount: 200
                },
                isActive: true,
                isVerified: true,
                createdBy: users.ORGANIZATION_ADMIN._id
            }
        ]

        for (const data of orgData) {
            const org = await Organization.create(data)
            organizations.push(org)
            console.log(`  ✓ Created organization: ${org.name} (${org.code})`)
        }
        console.log('✅ Organizations created\n')

        // 4. Create departments
        console.log('📚 Creating departments...')
        const departments = []

        // Create first two departments
        const dept1 = await Department.create({
            name: 'School of Engineering',
            shortName: 'Engineering',
            code: 'SEEDENG',
            type: 'SCHOOL',
            description: 'Engineering department',
            schoolId: schools[0]._id,
            isActive: true,
            createdBy: users.DEPARTMENT_ADMIN._id
        })
        departments.push(dept1)
        console.log(`  ✓ Created department: ${dept1.name} (${dept1.code})`)

        const dept2 = await Department.create({
            name: 'School of Medicine',
            shortName: 'Medicine',
            code: 'SEEDMED',
            type: 'SCHOOL',
            description: 'Medical school',
            schoolId: schools[0]._id,
            isActive: true,
            createdBy: users.DEPARTMENT_ADMIN._id
        })
        departments.push(dept2)
        console.log(`  ✓ Created department: ${dept2.name} (${dept2.code})`)

        // Create sub-department with parent reference
        const dept3 = await Department.create({
            name: 'Department of Computer Science',
            shortName: 'CS',
            code: 'SEEDCS',
            type: 'DEPARTMENT',
            description: 'Computer Science department',
            schoolId: schools[0]._id,
            parentDepartmentId: dept1._id,
            isActive: true,
            createdBy: users.DEPARTMENT_ADMIN._id
        })
        departments.push(dept3)
        console.log(`  ✓ Created department: ${dept3.name} (${dept3.code})`)

        // Create organization department
        const dept4 = await Department.create({
            name: 'HR Department',
            shortName: 'HR',
            code: 'SEEDHR',
            type: 'DEPARTMENT',
            description: 'Human Resources department',
            organizationId: organizations[0]._id,
            isActive: true,
            createdBy: users.DEPARTMENT_ADMIN._id
        })
        departments.push(dept4)
        console.log(`  ✓ Created department: ${dept4.name} (${dept4.code})`)
        console.log('✅ Departments created\n')

        // 5. Create associations
        console.log('🤝 Creating associations...')
        const associations = []
        const assocData = [
            {
                name: 'Student Engineering Association',
                shortName: 'SEA',
                code: 'SEEDSEA',
                type: 'STUDENT_CLUB',
                description: 'Engineering student association',
                schoolId: schools[0]._id,
                departmentId: departments[0]._id,
                isActive: true,
                isVerified: true,
                createdBy: users.ASSOCIATION_ADMIN._id
            },
            {
                name: 'Medical Students Association',
                shortName: 'MSA',
                code: 'SEEDMSA',
                type: 'STUDENT_CLUB',
                description: 'Medical students association',
                schoolId: schools[0]._id,
                departmentId: departments[1]._id,
                isActive: true,
                isVerified: true,
                createdBy: users.ASSOCIATION_ADMIN._id
            },
            {
                name: 'Ghana Medical Association',
                shortName: 'GMA',
                code: 'SEEDGMA',
                type: 'PROFESSIONAL_ASSOCIATION',
                description: 'Professional medical association',
                organizationId: organizations[1]._id,
                professionalInfo: {
                    licensingBody: 'Medical and Dental Council',
                    licenseRequired: true
                },
                isActive: true,
                isVerified: true,
                createdBy: users.PROFESSIONAL_ASSOCIATION_ADMIN._id
            }
        ]

        for (const data of assocData) {
            const assoc = await Association.create(data)
            associations.push(assoc)
            console.log(`  ✓ Created association: ${assoc.name} (${assoc.code})`)
        }
        console.log('✅ Associations created\n')

        // 6. Create elections for different users
        console.log('🗳️  Creating elections...')
        const elections = []
        const now = new Date()

        // School Admin elections
        const election1 = await Election.create({
            title: 'Seed Election - University SRC',
            description: 'Student Representative Council Election for Seed University',
            type: 'SRC_ELECTION',
            scope: 'SCHOOL',
            schoolId: schools[0]._id,
            startDateTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.SCHOOL_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election1)
        console.log(`  ✓ Created election: ${election1.title} (${election1.scope})`)

        const election2 = await Election.create({
            title: 'Seed Election - Engineering Department',
            description: 'Engineering Department Election',
            type: 'CLASS_REPRESENTATIVE',
            scope: 'DEPARTMENT',
            schoolId: schools[0]._id,
            departmentId: departments[0]._id, // dept1 (Engineering)
            startDateTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 17 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.DEPARTMENT_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election2)
        console.log(`  ✓ Created election: ${election2.title} (${election2.scope})`)

        // Organization Admin elections
        const election3 = await Election.create({
            title: 'Seed Election - NGO Board',
            description: 'Board of Directors Election for Seed NGO',
            type: 'GENERAL_ELECTION',
            scope: 'ORGANIZATION',
            organizationId: organizations[0]._id,
            startDateTime: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.ORGANIZATION_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election3)
        console.log(`  ✓ Created election: ${election3.title} (${election3.scope})`)

        // Association Admin elections
        const election4 = await Election.create({
            title: 'Seed Election - Engineering Association',
            description: 'Engineering Student Association Election',
            type: 'ASSOCIATION_ELECTION',
            scope: 'ASSOCIATION',
            schoolId: schools[0]._id,
            associationId: associations[0]._id,
            startDateTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.ASSOCIATION_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election4)
        console.log(`  ✓ Created election: ${election4.title} (${election4.scope})`)

        const election5 = await Election.create({
            title: 'Seed Election - Medical Association',
            description: 'Medical Students Association Election',
            type: 'ASSOCIATION_ELECTION',
            scope: 'ASSOCIATION',
            schoolId: schools[0]._id,
            associationId: associations[1]._id,
            startDateTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.ASSOCIATION_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election5)
        console.log(`  ✓ Created election: ${election5.title} (${election5.scope})`)

        // Professional Association Admin election
        const election6 = await Election.create({
            title: 'Seed Election - Professional Medical',
            description: 'Ghana Medical Association Election',
            type: 'ASSOCIATION_ELECTION',
            scope: 'ASSOCIATION',
            organizationId: organizations[1]._id,
            associationId: associations[2]._id,
            startDateTime: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.PROFESSIONAL_ASSOCIATION_ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election6)
        console.log(`  ✓ Created election: ${election6.title} (${election6.scope})`)

        // Admin elections
        const election7 = await Election.create({
            title: 'Seed Election - College SRC',
            description: 'Student Representative Council Election for Seed College',
            type: 'SRC_ELECTION',
            scope: 'SCHOOL',
            schoolId: schools[1]._id,
            startDateTime: new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election7)
        console.log(`  ✓ Created election: ${election7.title} (${election7.scope})`)

        const election8 = await Election.create({
            title: 'Seed Election - Company Board',
            description: 'Board of Directors Election for Seed Company',
            type: 'GENERAL_ELECTION',
            scope: 'ORGANIZATION',
            organizationId: organizations[2]._id,
            startDateTime: new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000),
            endDateTime: new Date(now.getTime() + 19 * 24 * 60 * 60 * 1000),
            timezone: 'Africa/Accra',
            status: 'SCHEDULED',
            createdBy: users.ADMIN._id,
            votingRules: {
                allowAbstention: true,
                maxVotesPerPosition: 1
            }
        })
        elections.push(election8)
        console.log(`  ✓ Created election: ${election8.title} (${election8.scope})`)
        console.log('✅ Elections created\n')

        // 7. Create positions for elections
        console.log('📋 Creating positions...')
        const positions = []
        const positionTitles = [
            'President',
            'Vice President',
            'Secretary',
            'Treasurer',
            'Public Relations Officer',
            'Academic Affairs Officer',
            'Welfare Officer'
        ]

        for (const election of elections) {
            const numPositions = Math.floor(Math.random() * 4) + 3 // 3-6 positions per election
            const selectedTitles = positionTitles.slice(0, numPositions)

            for (let i = 0; i < selectedTitles.length; i++) {
                const position = await Position.create({
                    title: selectedTitles[i],
                    description: `${selectedTitles[i]} position for ${election.title}`,
                    electionId: election._id,
                    orderIndex: i + 1,
                    category: 'REPRESENTATIVE',
                    maxCandidates: 5,
                    minCandidates: 2,
                    maxWinners: 1,
                    votingMethod: 'SINGLE_VOTE',
                    allowAbstention: true,
                    createdBy: election.createdBy
                })
                positions.push(position)
            }
        }
        console.log(`✅ Created ${positions.length} positions\n`)

        // 8. Create 100 voters distributed across elections
        console.log('👤 Creating 100 voters...')
        const voters = []
        const genders = ['MALE', 'FEMALE', 'OTHER']
        const yearOfStudy = ['1', '2', '3', '4', '5']

        // Distribute voters across different schools/organizations
        const voterDistribution = [
            { schoolId: schools[0]._id, count: 40, departmentId: departments[0]._id, associationId: associations[0]._id },
            { schoolId: schools[0]._id, count: 30, departmentId: departments[1]._id, associationId: associations[1]._id },
            { schoolId: schools[1]._id, count: 15 },
            { organizationId: organizations[0]._id, count: 10, departmentId: departments[3]._id },
            { organizationId: organizations[1]._id, count: 5, associationId: associations[2]._id }
        ]

        let voterIndex = 1
        for (const dist of voterDistribution) {
            for (let i = 0; i < dist.count; i++) {
                const firstName = `SeedVoter${voterIndex}`
                const lastName = `Test${voterIndex}`
                const email = `seed.voter${voterIndex}@example.com`
                const phone = `+233${240000000 + voterIndex}`

                // Generate voter ID - ensure uniqueness
                let schoolCode = null
                let orgCode = null
                if (dist.schoolId) {
                    const school = schools.find(s => s._id.toString() === dist.schoolId.toString())
                    schoolCode = school?.code
                }
                if (dist.organizationId) {
                    const org = organizations.find(o => o._id.toString() === dist.organizationId.toString())
                    orgCode = org?.code
                }

                // Generate unique voter ID
                let voterId
                let attempts = 0
                do {
                    voterId = await generateVoterId(dist.schoolId, dist.organizationId, schoolCode, orgCode)
                    const existing = await VoterRegistry.findOne({ voterId })
                    if (!existing) break
                    attempts++
                    if (attempts > 10) {
                        throw new Error(`Failed to generate unique voter ID after ${attempts} attempts`)
                    }
                } while (true)

                const voter = await VoterRegistry.create({
                    firstName,
                    lastName,
                    email,
                    phone,
                    voterId,
                    schoolId: dist.schoolId,
                    organizationId: dist.organizationId,
                    departmentId: dist.departmentId,
                    associationId: dist.associationId,
                    studentNumber: dist.schoolId ? `STU${String(voterIndex).padStart(6, '0')}` : null,
                    employeeNumber: dist.organizationId ? `EMP${String(voterIndex).padStart(6, '0')}` : null,
                    gender: genders[Math.floor(Math.random() * genders.length)],
                    dateOfBirth: new Date(1995 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                    yearOfStudy: dist.schoolId ? yearOfStudy[Math.floor(Math.random() * yearOfStudy.length)] : null,
                    eligibilityStatus: 'ELIGIBLE',
                    isActive: true,
                    isVerified: true,
                    registrationSource: 'SEED'
                })
                voters.push(voter)
                voterIndex++
            }
        }
        console.log(`✅ Created ${voters.length} voters\n`)

        // 9. Create some candidates
        console.log('🎯 Creating candidates...')
        let candidateCount = 0
        for (const position of positions) {
            const election = elections.find(e => e._id.toString() === position.electionId.toString())
            if (!election) continue

            // Find eligible voters for this election
            let eligibleVoters = []
            if (election.scope === 'SCHOOL') {
                eligibleVoters = voters.filter(v => v.schoolId && v.schoolId.toString() === election.schoolId.toString())
            } else if (election.scope === 'ORGANIZATION') {
                eligibleVoters = voters.filter(v => v.organizationId && v.organizationId.toString() === election.organizationId.toString())
            } else if (election.scope === 'DEPARTMENT') {
                eligibleVoters = voters.filter(v => v.departmentId && v.departmentId.toString() === election.departmentId.toString())
            } else if (election.scope === 'ASSOCIATION') {
                eligibleVoters = voters.filter(v => v.associationId && v.associationId.toString() === election.associationId.toString())
            }

            if (eligibleVoters.length === 0) continue

            // Select 2-4 random voters as candidates
            const numCandidates = Math.min(Math.floor(Math.random() * 3) + 2, eligibleVoters.length, position.maxCandidates)
            const selectedVoters = eligibleVoters.sort(() => 0.5 - Math.random()).slice(0, numCandidates)

            for (const voter of selectedVoters) {
                await Candidate.create({
                    electionId: election._id,
                    positionId: position._id,
                    voterId: voter._id,
                    fullName: `${voter.firstName} ${voter.lastName}`,
                    displayName: `${voter.firstName} ${voter.lastName.charAt(0)}.`,
                    manifesto: `I promise to serve the ${position.title} role with dedication and integrity.`,
                    campaignSlogan: `Vote for ${voter.firstName}!`,
                    shortBio: `Experienced student with a passion for leadership and service.`,
                    status: 'APPROVED',
                    createdBy: election.createdBy
                })
                candidateCount++
            }
        }
        console.log(`✅ Created ${candidateCount} candidates\n`)

        // Summary
        console.log('📊 Seed Summary:')
        console.log(`  • Users: ${Object.keys(users).length}`)
        console.log(`  • Schools: ${schools.length}`)
        console.log(`  • Organizations: ${organizations.length}`)
        console.log(`  • Departments: ${departments.length}`)
        console.log(`  • Associations: ${associations.length}`)
        console.log(`  • Elections: ${elections.length}`)
        console.log(`  • Positions: ${positions.length}`)
        console.log(`  • Voters: ${voters.length}`)
        console.log(`  • Candidates: ${candidateCount}`)
        console.log('\n✅ Seed data created successfully!')
        console.log('\n📝 Login credentials:')
        console.log('   All users use password: SeedPass123!')
        for (const [role, user] of Object.entries(users)) {
            console.log(`   ${role}: ${user.email}`)
        }

        process.exit(0)
    } catch (error) {
        console.error('❌ Seed error:', error)
        process.exit(1)
    }
}

// Run seed
seedData()

