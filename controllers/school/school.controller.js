const mongoose = require('mongoose')
const School = require('../../models/School')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Create a new school
 */
const createSchool = async (req, res) => {
    try {
        const userId = req.user.id
        const schoolData = req.body

        // Check if school with same code already exists
        const existingSchool = await School.findOne({ code: schoolData.code.toUpperCase() })
        if (existingSchool) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('School with this code already exists', HTTP_STATUS.CONFLICT)
            )
        }

        const school = await School.create({
            ...schoolData,
            code: schoolData.code.toUpperCase(),
            addedBy: userId
        })

        logger.info({
            type: 'school_created',
            schoolId: school._id,
            userId
        }, 'School created successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(school, 'School created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'school_create_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to create school')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all schools
 */
const getSchools = async (req, res) => {
    try {
        const { page = 1, limit = 50, status, type, search } = req.query

        const query = {}
        if (status) query.status = status
        if (type) query.type = type
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { shortName: { $regex: search, $options: 'i' } }
            ]
        }

        const schools = await School.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('addedBy', 'firstname lastname email')
            .populate('updatedBy', 'firstname lastname email')

        const total = await School.countDocuments(query)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                schools,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }, 'Schools retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_schools_error',
            error: error.message
        }, 'Failed to retrieve schools')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve schools', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a single school by ID
 */
const getSchoolById = async (req, res) => {
    try {
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const school = await School.findById(id)
            .populate('addedBy', 'firstname lastname email')
            .populate('updatedBy', 'firstname lastname email')

        if (!school) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(school, 'School retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_school_error',
            error: error.message
        }, 'Failed to retrieve school')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update a school
 */
const updateSchool = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params
        const updateData = req.body

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const school = await School.findById(id)
        if (!school) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // If code is being updated, check for conflicts
        if (updateData.code && updateData.code.toUpperCase() !== school.code) {
            const existingSchool = await School.findOne({ code: updateData.code.toUpperCase() })
            if (existingSchool) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('School with this code already exists', HTTP_STATUS.CONFLICT)
                )
            }
            updateData.code = updateData.code.toUpperCase()
        }

        Object.assign(school, updateData)
        school.updatedBy = userId
        await school.save()

        logger.info({
            type: 'school_updated',
            schoolId: school._id,
            userId
        }, 'School updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(school, 'School updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'school_update_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to update school')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete a school (soft delete by setting isActive to false)
 */
const deleteSchool = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const school = await School.findById(id)
        if (!school) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        school.isActive = false
        school.status = 'INACTIVE'
        school.updatedBy = userId
        await school.save()

        logger.info({
            type: 'school_deleted',
            schoolId: school._id,
            userId
        }, 'School deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(school, 'School deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'school_delete_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to delete school')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify a school
 */
const verifySchool = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const school = await School.findById(id)
        if (!school) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        school.isVerified = true
        school.verifiedBy = userId
        school.verifiedAt = new Date()
        school.status = 'ACTIVE'
        school.updatedBy = userId
        await school.save()

        logger.info({
            type: 'school_verified',
            schoolId: school._id,
            userId
        }, 'School verified successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(school, 'School verified successfully')
        )
    } catch (error) {
        logger.error({
            type: 'school_verify_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to verify school')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify school', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    createSchool,
    getSchools,
    getSchoolById,
    updateSchool,
    deleteSchool,
    verifySchool
}

