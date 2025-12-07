/**
 * Script to create Admin and Super Admin users for testing
 *
 * Usage: node scripts/createAdminUsers.js
 *
 * This script creates:
 * - 1 Super Admin user
 * - 1 Admin user
 * - 1 user for each other role (SCHOOL_ADMIN, ASSOCIATION_ADMIN, PROFESSIONAL_ASSOCIATION_ADMIN, ELECTION_OFFICER)
 *
 * All users will be created with verified and active status.
 */

const mongoose = require('mongoose')
require('dotenv').config()

const User = require('../models/User')
const authService = require('../services/authService')

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

// User data configuration
const usersToCreate = [
    {
        email: 'superadmin@voteapi.com',
        password: 'SuperAdmin123!',
        firstname: 'Super',
        lastname: 'Admin',
        phone: '+233241000001',
        role: 'SUPER_ADMIN',
        description: 'Super Admin - Full platform access'
    },
    {
        email: 'admin@voteapi.com',
        password: 'Admin123!',
        firstname: 'Admin',
        lastname: 'User',
        phone: '+233241000002',
        role: 'ADMIN',
        description: 'Admin - Platform administration'
    },
    {
        email: 'schooladmin@voteapi.com',
        password: 'SchoolAdmin123!',
        firstname: 'School',
        lastname: 'Admin',
        phone: '+233241000003',
        role: 'SCHOOL_ADMIN',
        description: 'School Admin - School management'
    },
    {
        email: 'associationadmin@voteapi.com',
        password: 'AssociationAdmin123!',
        firstname: 'Association',
        lastname: 'Admin',
        phone: '+233241000004',
        role: 'ASSOCIATION_ADMIN',
        description: 'Association Admin - Association management'
    },
    {
        email: 'professionaladmin@voteapi.com',
        password: 'ProfessionalAdmin123!',
        firstname: 'Professional',
        lastname: 'Admin',
        phone: '+233241000005',
        role: 'PROFESSIONAL_ASSOCIATION_ADMIN',
        description: 'Professional Association Admin - Professional association management'
    },
    {
        email: 'electionofficer@voteapi.com',
        password: 'ElectionOfficer123!',
        firstname: 'Election',
        lastname: 'Officer',
        phone: '+233241000006',
        role: 'ELECTION_OFFICER',
        description: 'Election Officer - Election management'
    }
]

const createAdminUsers = async () => {
    try {
        await connectDB()

        console.log('🌱 Starting admin user creation process...\n')

        const createdUsers = []
        const skippedUsers = []

        for (const userData of usersToCreate) {
            try {
                // Check if user already exists
                const existingUser = await User.findOne({
                    $or: [
                        { email: userData.email.toLowerCase() },
                        { phone: userData.phone }
                    ]
                })

                if (existingUser) {
                    console.log(`⏭️  Skipping ${ userData.role } - User already exists: ${ userData.email }`)
                    skippedUsers.push({
                        ...userData,
                        existingId: existingUser._id
                    })
                    continue
                }

                // Hash password
                const hashedPassword = await authService.hashPassword(userData.password)

                // Create user
                const user = await User.create({
                    email: userData.email.toLowerCase(),
                    password: hashedPassword,
                    firstname: userData.firstname,
                    lastname: userData.lastname,
                    phone: userData.phone,
                    role: userData.role,
                    verified: true,
                    isActive: true
                })

                createdUsers.push({
                    ...userData,
                    id: user._id
                })

                console.log(`✅ Created ${ userData.role }: ${ userData.email }`)
                console.log(`   ${ userData.description }`)
                console.log(`   Password: ${ userData.password }\n`)

            } catch (error) {
                console.error(`❌ Error creating ${ userData.role } (${ userData.email }):`, error.message)
            }
        }

        // Summary
        console.log('\n📊 Summary:')
        console.log(`  • Created: ${ createdUsers.length } users`)
        console.log(`  • Skipped: ${ skippedUsers.length } users (already exist)`)
        console.log(`  • Total: ${ usersToCreate.length } users\n`)

        if (createdUsers.length > 0) {
            console.log('✅ New users created:')
            createdUsers.forEach(user => {
                console.log(`   ${ user.role }: ${ user.email } (Password: ${ user.password })`)
            })
        }

        if (skippedUsers.length > 0) {
            console.log('\n⏭️  Existing users (not modified):')
            skippedUsers.forEach(user => {
                console.log(`   ${ user.role }: ${ user.email }`)
            })
        }

        console.log('\n📝 Login Credentials:')
        console.log('   Use these credentials to login via Postman or API\n')
        usersToCreate.forEach(user => {
            console.log(`   ${ user.role }:`)
            console.log(`     Email: ${ user.email }`)
            console.log(`     Password: ${ user.password }\n`)
        })

        console.log('✅ Admin user creation process completed!')
        process.exit(0)

    } catch (error) {
        console.error('❌ Error in admin user creation:', error)
        process.exit(1)
    }
}

// Run the script
createAdminUsers()

