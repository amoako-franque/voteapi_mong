const mongoose = require('mongoose')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const User = require('../../models/User')
const School = require('../../models/School')
const Association = require('../../models/Association')
const authService = require('../../services/authService')
const auditLogService = require('../../services/auditLogService')

/**
 * Get current user profile
 * GET /api/users/me
 */
const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId)
            .select('-password')
            .populate('schoolId', 'name shortName code')
            .populate('associationId', 'name shortName code')

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(user, 'Profile retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_my_profile_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get user profile')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve profile', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update current user profile
 * PUT /api/users/me
 */
const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.id
        const { firstname, lastname, phone, username } = req.body

        const user = await User.findById(userId)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if phone is being changed and if it's already taken
        if (phone && phone !== user.phone) {
            const existingUser = await User.findOne({ phone, _id: { $ne: userId } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Phone number already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Check if username is being changed and if it's already taken
        if (username && username !== user.username) {
            const existingUser = await User.findOne({ username, _id: { $ne: userId } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Username already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Update allowed fields
        if (firstname) user.firstname = firstname
        if (lastname) user.lastname = lastname
        if (phone) user.phone = phone
        if (username !== undefined) user.username = username

        await user.save()

        logger.info({
            type: 'user_profile_updated',
            userId: user._id
        }, 'User profile updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(user, 'Profile updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_my_profile_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to update user profile')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update profile', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Change password
 * PUT /api/users/me/password
 */
const changePassword = async (req, res) => {
    try {
        const userId = req.user.id
        const { currentPassword, newPassword } = req.body

        const user = await User.findById(userId).select('+password')
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Verify current password
        const isPasswordValid = await authService.comparePassword(currentPassword, user.password)
        if (!isPasswordValid) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                responseFormatter.error('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED)
            )
        }

        // Hash new password
        const hashedPassword = await authService.hashPassword(newPassword)
        user.password = hashedPassword
        await user.save()

        await auditLogService.logSecurityAction(
            userId,
            'PASSWORD_CHANGED',
            {
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            },
            true,
            req
        )

        logger.info({
            type: 'user_password_changed',
            userId: user._id
        }, 'User password changed')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Password changed successfully')
        )
    } catch (error) {
        logger.error({
            type: 'change_password_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to change password')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to change password', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Create an election officer (linked to creator's school or association)
 * POST /api/users/election-officers
 */
const createElectionOfficer = async (req, res) => {
    try {
        const creatorId = req.user.id
        const creator = await User.findById(creatorId)

        if (!creator) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Creator user not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Only SCHOOL_ADMIN, ASSOCIATION_ADMIN, or PROFESSIONAL_ASSOCIATION_ADMIN can create election officers
        const allowedRoles = ['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']
        if (!allowedRoles.includes(creator.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only school or association admins can create election officers', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Creator must have a schoolId or associationId
        if (!creator.schoolId && !creator.associationId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Creator must be linked to a school or association', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const { email, password, firstname, lastname, phone, username } = req.body

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                { phone }
            ]
        })

        if (existingUser) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('User with provided email or phone already exists', HTTP_STATUS.CONFLICT)
            )
        }

        // Check if username is taken (if provided)
        if (username) {
            const existingUsername = await User.findOne({ username })
            if (existingUsername) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Username already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Verify school or association exists and is active
        if (creator.schoolId) {
            const school = await School.findById(creator.schoolId)
            if (!school || !school.isActive || !school.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Linked school is not active or verified', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        if (creator.associationId) {
            const association = await Association.findById(creator.associationId)
            if (!association || !association.isActive || !association.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Linked association is not active or verified', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Hash password
        const hashedPassword = await authService.hashPassword(password)

        // Create election officer
        const electionOfficer = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstname,
            lastname,
            phone,
            username: username || undefined,
            role: 'ELECTION_OFFICER',
            schoolId: creator.schoolId || null,
            associationId: creator.associationId || null,
            createdBy: creatorId,
            verified: true, // Auto-verify since created by admin
            isActive: true,
            // Set election permissions
            permissions: {
                canCreateElection: true,
                canApproveCandidates: true,
                canManageVoters: true,
                canViewResults: true
            }
        })

        await auditLogService.logSecurityAction(
            creatorId,
            'ELECTION_OFFICER_CREATED',
            {
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                createdUserId: electionOfficer._id,
                createdUserEmail: electionOfficer.email,
                schoolId: creator.schoolId,
                associationId: creator.associationId
            },
            true,
            req
        )

        logger.info({
            type: 'election_officer_created',
            creatorId,
            electionOfficerId: electionOfficer._id,
            schoolId: creator.schoolId,
            associationId: creator.associationId
        }, 'Election officer created')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created(authService.buildSafeUser(electionOfficer), 'Election officer created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'create_election_officer_error',
            error: error.message,
            creatorId: req.user.id
        }, 'Failed to create election officer')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create election officer', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all election officers created by current user
 * GET /api/users/election-officers
 */
const getMyElectionOfficers = async (req, res) => {
    try {
        const creatorId = req.user.id
        const creator = await User.findById(creatorId)

        if (!creator) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const allowedRoles = ['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']
        if (!allowedRoles.includes(creator.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only school or association admins can view election officers', HTTP_STATUS.FORBIDDEN)
            )
        }

        const { page = 1, limit = 50 } = req.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        // Find election officers created by this user
        const query = {
            createdBy: creatorId,
            role: 'ELECTION_OFFICER'
        }

        // Filter by same school or association
        if (creator.schoolId) {
            query.schoolId = creator.schoolId
        } else if (creator.associationId) {
            query.associationId = creator.associationId
        }

        const [electionOfficers, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .populate('schoolId', 'name shortName code')
                .populate('associationId', 'name shortName code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                electionOfficers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Election officers retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_my_election_officers_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get election officers')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve election officers', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a specific election officer created by current user
 * GET /api/users/election-officers/:id
 */
const getElectionOfficer = async (req, res) => {
    try {
        const creatorId = req.user.id
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election officer ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const creator = await User.findById(creatorId)
        if (!creator) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Creator user not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const allowedRoles = ['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']
        if (!allowedRoles.includes(creator.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only school or association admins can view election officers', HTTP_STATUS.FORBIDDEN)
            )
        }

        const query = {
            _id: id,
            createdBy: creatorId,
            role: 'ELECTION_OFFICER'
        }

        // Ensure same school or association
        if (creator.schoolId) {
            query.schoolId = creator.schoolId
        } else if (creator.associationId) {
            query.associationId = creator.associationId
        }

        const electionOfficer = await User.findOne(query)
            .select('-password')
            .populate('schoolId', 'name shortName code')
            .populate('associationId', 'name shortName code')

        if (!electionOfficer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election officer not found or you do not have permission to view it', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(electionOfficer, 'Election officer retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_election_officer_error',
            error: error.message,
            userId: req.user.id,
            electionOfficerId: req.params.id
        }, 'Failed to get election officer')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve election officer', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update an election officer created by current user
 * PUT /api/users/election-officers/:id
 */
const updateElectionOfficer = async (req, res) => {
    try {
        const creatorId = req.user.id
        const { id } = req.params
        const { firstname, lastname, phone, username, isActive } = req.body

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election officer ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const creator = await User.findById(creatorId)
        if (!creator) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Creator user not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const allowedRoles = ['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN']
        if (!allowedRoles.includes(creator.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only school or association admins can update election officers', HTTP_STATUS.FORBIDDEN)
            )
        }

        const query = {
            _id: id,
            createdBy: creatorId,
            role: 'ELECTION_OFFICER'
        }

        // Ensure same school or association
        if (creator.schoolId) {
            query.schoolId = creator.schoolId
        } else if (creator.associationId) {
            query.associationId = creator.associationId
        }

        const electionOfficer = await User.findOne(query)
        if (!electionOfficer) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election officer not found or you do not have permission to update it', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if phone is being changed and if it's already taken
        if (phone && phone !== electionOfficer.phone) {
            const existingUser = await User.findOne({ phone, _id: { $ne: id } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Phone number already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Check if username is being changed and if it's already taken
        if (username && username !== electionOfficer.username) {
            const existingUser = await User.findOne({ username, _id: { $ne: id } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Username already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Update allowed fields
        if (firstname) electionOfficer.firstname = firstname
        if (lastname) electionOfficer.lastname = lastname
        if (phone) electionOfficer.phone = phone
        if (username !== undefined) electionOfficer.username = username
        if (isActive !== undefined) electionOfficer.isActive = isActive

        await electionOfficer.save()

        logger.info({
            type: 'election_officer_updated',
            creatorId,
            electionOfficerId: electionOfficer._id
        }, 'Election officer updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(authService.buildSafeUser(electionOfficer), 'Election officer updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_election_officer_error',
            error: error.message,
            userId: req.user.id,
            electionOfficerId: req.params.id
        }, 'Failed to update election officer')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update election officer', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all users (Admin only)
 * GET /api/users
 */
const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 50, role, isActive, search } = req.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        // Build query
        const query = {}
        if (role) query.role = role
        if (isActive !== undefined) query.isActive = isActive === 'true'
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { firstname: { $regex: search, $options: 'i' } },
                { lastname: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ]
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .populate('schoolId', 'name shortName code')
                .populate('associationId', 'name shortName code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Users retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_all_users_error',
            error: error.message
        }, 'Failed to get users')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve users', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get user by ID (Admin only)
 * GET /api/users/:id
 */
const getUserById = async (req, res) => {
    try {
        const { id } = req.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const user = await User.findById(id)
            .select('-password')
            .populate('schoolId', 'name shortName code')
            .populate('associationId', 'name shortName code')

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(user, 'User retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_user_by_id_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to get user')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve user', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Create user (Admin only)
 * POST /api/users
 */
const createUser = async (req, res) => {
    try {
        const { email, password, firstname, lastname, phone, role, username, schoolId, associationId } = req.body

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                { phone }
            ]
        })

        if (existingUser) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('User with provided email or phone already exists', HTTP_STATUS.CONFLICT)
            )
        }

        // Check if username is taken (if provided)
        if (username) {
            const existingUsername = await User.findOne({ username })
            if (existingUsername) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Username already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Hash password
        const hashedPassword = await authService.hashPassword(password)

        // Create user
        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstname,
            lastname,
            phone,
            username: username || undefined,
            role: role || 'ELECTION_OFFICER',
            schoolId: schoolId || null,
            associationId: associationId || null,
            createdBy: req.user.id,
            verified: true,
            isActive: true
        })

        await auditLogService.logSecurityAction(
            req.user.id,
            'USER_CREATED',
            {
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                createdUserId: user._id,
                createdUserEmail: user.email,
                role: user.role
            },
            true,
            req
        )

        logger.info({
            type: 'user_created',
            creatorId: req.user.id,
            userId: user._id
        }, 'User created')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created(authService.buildSafeUser(user), 'User created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'create_user_error',
            error: error.message,
            creatorId: req.user.id
        }, 'Failed to create user')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create user', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update user (Admin only)
 * PUT /api/users/:id
 */
const updateUser = async (req, res) => {
    try {
        const { id } = req.params
        const { firstname, lastname, phone, username, isActive, role, schoolId, associationId } = req.body

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const user = await User.findById(id)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if phone is being changed and if it's already taken
        if (phone && phone !== user.phone) {
            const existingUser = await User.findOne({ phone, _id: { $ne: id } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Phone number already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Check if username is being changed and if it's already taken
        if (username && username !== user.username) {
            const existingUser = await User.findOne({ username, _id: { $ne: id } })
            if (existingUser) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Username already in use', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Update allowed fields
        if (firstname) user.firstname = firstname
        if (lastname) user.lastname = lastname
        if (phone) user.phone = phone
        if (username !== undefined) user.username = username
        if (isActive !== undefined) user.isActive = isActive
        if (role) user.role = role
        if (schoolId !== undefined) user.schoolId = schoolId
        if (associationId !== undefined) user.associationId = associationId

        await user.save()

        logger.info({
            type: 'user_updated',
            updaterId: req.user.id,
            userId: user._id
        }, 'User updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(authService.buildSafeUser(user), 'User updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_user_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to update user')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update user', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update user role (Admin only)
 * PUT /api/users/:id/role
 */
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params
        const { role } = req.body

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const user = await User.findById(id)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        user.role = role
        await user.save()

        await auditLogService.logSecurityAction(
            req.user.id,
            'USER_ROLE_UPDATED',
            {
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                targetUserId: user._id,
                newRole: role,
                oldRole: user.role
            },
            true,
            req
        )

        logger.info({
            type: 'user_role_updated',
            updaterId: req.user.id,
            userId: user._id,
            newRole: role
        }, 'User role updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(authService.buildSafeUser(user), 'User role updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_user_role_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to update user role')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update user role', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get user activity log
 * GET /api/users/:id/activity
 */
const getUserActivity = async (req, res) => {
    try {
        const { id } = req.params
        const { page = 1, limit = 50 } = req.query
        const skip = (parseInt(page) - 1) * parseInt(limit)

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid user ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const AuditLog = require('../../models/AuditLog')
        const [logs, total] = await Promise.all([
            AuditLog.find({ userId: id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AuditLog.countDocuments({ userId: id })
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'User activity retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_user_activity_error',
            error: error.message,
            userId: req.params.id
        }, 'Failed to get user activity')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve user activity', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get notification preferences
 * GET /api/users/me/notification-preferences
 */
const getNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId).select('notificationPreferences')

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(
                user.notificationPreferences || {},
                'Notification preferences retrieved successfully'
            )
        )
    } catch (error) {
        logger.error({
            type: 'get_notification_preferences_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to get notification preferences')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve notification preferences', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update notification preferences
 * PUT /api/users/me/notification-preferences
 */
const updateNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id
        const preferences = req.body

        const user = await User.findById(userId)
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Merge preferences (don't overwrite entire object)
        if (!user.notificationPreferences) {
            user.notificationPreferences = {}
        }

        // Update email preferences
        if (preferences.email) {
            user.notificationPreferences.email = {
                ...user.notificationPreferences.email,
                ...preferences.email
            }
        }

        // Update SMS preferences
        if (preferences.sms) {
            user.notificationPreferences.sms = {
                ...user.notificationPreferences.sms,
                ...preferences.sms
            }
        }

        // Update push preferences
        if (preferences.push) {
            user.notificationPreferences.push = {
                ...user.notificationPreferences.push,
                ...preferences.push
            }
        }

        // Update in-app preferences
        if (preferences.inApp) {
            user.notificationPreferences.inApp = {
                ...user.notificationPreferences.inApp,
                ...preferences.inApp
            }
        }

        await user.save()

        logger.info({
            type: 'notification_preferences_updated',
            userId
        }, 'Notification preferences updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(
                user.notificationPreferences,
                'Notification preferences updated successfully'
            )
        )
    } catch (error) {
        logger.error({
            type: 'update_notification_preferences_error',
            error: error.message,
            userId: req.user.id
        }, 'Failed to update notification preferences')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update notification preferences', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getMyProfile,
    updateMyProfile,
    getNotificationPreferences,
    updateNotificationPreferences,
    changePassword,
    createElectionOfficer,
    getMyElectionOfficers,
    getElectionOfficer,
    updateElectionOfficer,
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    updateUserRole,
    getUserActivity
}

