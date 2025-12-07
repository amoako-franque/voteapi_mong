/**
 * Script to create voters for each user role
 *
 * Usage: node scripts/createVotersForRoles.js
 *
 * This script creates voters associated with schools/organizations
 * that can be used by each user role for testing elections.
 *
 * Prerequisites:
 * - Admin users must be created first (run createAdminUsers.js)
 * - At least one school should exist in the database
 * - At least one association should exist in the database
 */

const mongoose = require('mongoose')
require('dotenv').config()

const User = require('../models/User')
const School = require('../models/School')
const Association = require('../models/Association')
const VoterRegistry = require('../models/VoterRegistry')
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

// Generate voter ID
const generateVoterId = (schoolCode, associationCode) => {
    const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase()
    if (schoolCode && associationCode) {
        return `${ schoolCode }-${ associationCode }-${ randomHex }`
    } else if (schoolCode) {
        return `${ schoolCode }-${ randomHex }`
    } else if (associationCode) {
        return `${ associationCode }-${ randomHex }`
    }
    return `VOTER-${ randomHex }`
}

// Create voters for each role
const createVotersForRoles = async () => {
    try {
        await connectDB()

        console.log('🌱 Starting voter creation process...\n')

        // Get admin users to use as createdBy
        const superAdmin = await User.findOne({ role: 'SUPER_ADMIN' })
        const admin = await User.findOne({ role: 'ADMIN' })
        const schoolAdmin = await User.findOne({ role: 'SCHOOL_ADMIN' })
        const associationAdmin = await User.findOne({ role: 'ASSOCIATION_ADMIN' })
        const professionalAdmin = await User.findOne({ role: 'PROFESSIONAL_ASSOCIATION_ADMIN' })
        const electionOfficer = await User.findOne({ role: 'ELECTION_OFFICER' })

        if (!superAdmin) {
            console.error('❌ Super Admin user not found. Please run createAdminUsers.js first.')
            process.exit(1)
        }

        // Get or create a test school
        let testSchool = await School.findOne({ code: 'TESTUNIV' })
        if (!testSchool) {
            console.log('📝 Creating test school...')
            testSchool = await School.create({
                name: 'Test University',
                shortName: 'TestU',
                code: 'TESTUNIV',
                type: 'UNIVERSITY',
                description: 'Test university for voter creation',
                email: 'info@testuniv.edu',
                phone: '+233241234567',
                address: {
                    street: '123 Test Street',
                    city: 'Accra',
                    state: 'Greater Accra',
                    country: 'Ghana'
                },
                isActive: true,
                isVerified: true,
                addedBy: superAdmin._id
            })
            console.log(`✅ Created test school: ${ testSchool.name } (${ testSchool.code })\n`)
        } else {
            console.log(`✅ Using existing school: ${ testSchool.name } (${ testSchool.code })\n`)
        }

        // Get or create a test association
        let testAssociation = await Association.findOne({ code: 'TESTASSOC' })
        if (!testAssociation) {
            console.log('📝 Creating test association...')
            testAssociation = await Association.create({
                name: 'Test Student Association',
                code: 'TESTASSOC',
                type: 'STUDENT_CLUB',
                description: 'Test association for voter creation',
                schoolId: testSchool._id,
                email: 'info@testassoc.org',
                isActive: true,
                isVerified: true,
                status: 'ACTIVE',
                createdBy: associationAdmin?._id || superAdmin._id
            })
            console.log(`✅ Created test association: ${ testAssociation.name } (${ testAssociation.code })\n`)
        } else {
            console.log(`✅ Using existing association: ${ testAssociation.name } (${ testAssociation.code })\n`)
        }

        // Voters configuration - 5 voters per role
        const votersPerRole = 150
        const genders = ['MALE', 'FEMALE', 'OTHER']
        const yearOfStudy = ['1', '2', '3', '4', '5']

        const votersToCreate = []

        // Create voters for SUPER_ADMIN
        console.log('👥 Creating voters for SUPER_ADMIN...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `SuperAdminVoter${ i }`
            const lastName = `Test${ i }`
            const email = `superadmin.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(1000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, null)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                studentNumber: `STU${ String(i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: superAdmin._id
            })
        }

        // Create voters for ADMIN
        console.log('👥 Creating voters for ADMIN...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `AdminVoter${ i }`
            const lastName = `Test${ i }`
            const email = `admin.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(2000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, null)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                studentNumber: `STU${ String(10 + i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: admin?._id || superAdmin._id
            })
        }

        // Create voters for SCHOOL_ADMIN
        console.log('👥 Creating voters for SCHOOL_ADMIN...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `SchoolAdminVoter${ i }`
            const lastName = `Test${ i }`
            const email = `schooladmin.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(3000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, null)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                studentNumber: `STU${ String(20 + i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: schoolAdmin?._id || superAdmin._id
            })
        }

        // Create voters for ASSOCIATION_ADMIN
        console.log('👥 Creating voters for ASSOCIATION_ADMIN...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `AssociationAdminVoter${ i }`
            const lastName = `Test${ i }`
            const email = `associationadmin.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(4000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, testAssociation.code)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                associationId: testAssociation._id,
                studentNumber: `STU${ String(30 + i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: associationAdmin?._id || superAdmin._id
            })
        }

        // Create voters for PROFESSIONAL_ASSOCIATION_ADMIN
        console.log('👥 Creating voters for PROFESSIONAL_ASSOCIATION_ADMIN...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `ProfessionalAdminVoter${ i }`
            const lastName = `Test${ i }`
            const email = `professionaladmin.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(5000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, testAssociation.code)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                associationId: testAssociation._id,
                studentNumber: `STU${ String(40 + i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: professionalAdmin?._id || superAdmin._id
            })
        }

        // Create voters for ELECTION_OFFICER
        console.log('👥 Creating voters for ELECTION_OFFICER...')
        for (let i = 1; i <= votersPerRole; i++) {
            const firstName = `ElectionOfficerVoter${ i }`
            const lastName = `Test${ i }`
            const email = `electionofficer.voter${ i }@testuniv.edu`
            const phone = `+23324100${ String(6000 + i).padStart(4, '0') }`
            const voterId = generateVoterId(testSchool.code, null)

            votersToCreate.push({
                firstName,
                lastName,
                email,
                phone,
                voterId,
                schoolId: testSchool._id,
                studentNumber: `STU${ String(50 + i).padStart(6, '0') }`,
                gender: genders[i % genders.length],
                dateOfBirth: new Date(1995 + (i % 10), (i % 12), (i % 28) + 1),
                yearOfStudy: yearOfStudy[i % yearOfStudy.length],
                eligibilityStatus: 'ELIGIBLE',
                isActive: true,
                isVerified: true,
                registrationSource: 'MANUAL',
                createdBy: electionOfficer?._id || superAdmin._id
            })
        }

        // Create voters in database
        console.log('\n💾 Saving voters to database...\n')
        const createdVoters = []
        const skippedVoters = []

        for (const voterData of votersToCreate) {
            try {
                // Check if voter already exists
                const existingVoter = await VoterRegistry.findOne({
                    $or: [
                        { email: voterData.email.toLowerCase() },
                        { voterId: voterData.voterId }
                    ]
                })

                if (existingVoter) {
                    skippedVoters.push(voterData)
                    continue
                }

                const voter = await VoterRegistry.create(voterData)
                createdVoters.push(voter)
                console.log(`✅ Created voter: ${ voter.firstName } ${ voter.lastName } (${ voter.email })`)

            } catch (error) {
                console.error(`❌ Error creating voter ${ voterData.email }:`, error.message)
            }
        }

        // Summary
        console.log('\n📊 Summary:')
        console.log(`  • Total voters to create: ${ votersToCreate.length }`)
        console.log(`  • Created: ${ createdVoters.length } voters`)
        console.log(`  • Skipped: ${ skippedVoters.length } voters (already exist)`)
        console.log(`  • Voters per role: ${ votersPerRole }`)
        console.log(`  • School: ${ testSchool.name } (${ testSchool.code })`)
        console.log(`  • Association: ${ testAssociation.name } (${ testAssociation.code })\n`)

        console.log('✅ Voter creation process completed!')
        console.log('\n📝 Note: These voters can now be used in elections created by their respective user roles.')
        process.exit(0)

    } catch (error) {
        console.error('❌ Error in voter creation:', error)
        process.exit(1)
    }
}

// Run the script
createVotersForRoles()

