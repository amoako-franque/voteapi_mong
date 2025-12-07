const mongoose = require('mongoose')
const Association = require('../../models/Association')
const School = require('../../models/School')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Create a new association
 */
const createAssociation = async (req, res) => {
    try {
        const userId = req.user.id
        const { schoolId, code, ...associationData } = req.body

        // Validate ObjectId format if provided
        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid schoolId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Verify school exists (if provided)
        if (schoolId) {
            const school = await School.findById(schoolId)
            if (!school) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
                )
            }
            if (!school.isActive || !school.isVerified) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('School must be active and verified', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        // Check if association with same code already exists in the same context
        // For standalone associations (no parent), code must be globally unique among standalone associations
        // For associations with parents, code must be unique within that parent
        const query = { code: code.toUpperCase() }

        // If no parent is specified, check for standalone associations
        if (!schoolId) {
            query.$and = [
                { $or: [{ schoolId: null }, { schoolId: { $exists: false } }] }
            ]
        } else {
            // If parent is specified, check within that specific context
            query.schoolId = schoolId
        }

        const existingAssociation = await Association.findOne(query)
        if (existingAssociation) {
            const context = schoolId ? 'school' : 'standalone'
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error(`Association with this code already exists in this ${ context }`, HTTP_STATUS.CONFLICT)
            )
        }

        const association = await Association.create({
            ...associationData,
            code: code.toUpperCase(),
            schoolId: schoolId || undefined,
            createdBy: userId
        })

        logger.info({
            type: 'association_created',
            associationId: association._id,
            schoolId,
            userId
        }, 'Association created successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(association, 'Association created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'association_create_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to create association')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all associations
 */
const getAssociations = async (req, res) => {
    try {
        const { page = 1, limit = 50, status, type, schoolId, search } = req.query

        // Validate ObjectIds if provided
        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid schoolId format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const query = {}
        if (status) query.status = status
        if (type) query.type = type
        if (schoolId) query.schoolId = schoolId
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { shortName: { $regex: search, $options: 'i' } }
            ]
        }

        const associations = await Association.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('schoolId', 'name code')
            .populate('createdBy', 'firstname lastname email')

        const total = await Association.countDocuments(query)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                associations,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }, 'Associations retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_associations_error',
            error: error.message
        }, 'Failed to retrieve associations')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve associations', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a single association by ID
 */
const getAssociationById = async (req, res) => {
    try {
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const association = await Association.findById(id)
            .populate('schoolId', 'name code')
            .populate('createdBy', 'firstname lastname email')
            .populate('updatedBy', 'firstname lastname email')
            .populate('verifiedBy', 'firstname lastname email')

        if (!association) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(association, 'Association retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_association_error',
            error: error.message
        }, 'Failed to retrieve association')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update an association
 */
const updateAssociation = async (req, res) => {
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

        const association = await Association.findById(id)
        if (!association) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // If code is being updated, check for conflicts
        if (updateData.code && updateData.code.toUpperCase() !== association.code) {
            const query = { code: updateData.code.toUpperCase() }
            if (association.schoolId) query.schoolId = association.schoolId

            const existingAssociation = await Association.findOne(query)
            if (existingAssociation) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('Association with this code already exists in this context', HTTP_STATUS.CONFLICT)
                )
            }
            updateData.code = updateData.code.toUpperCase()
        }

        Object.assign(association, updateData)
        association.updatedBy = userId
        await association.save()

        logger.info({
            type: 'association_updated',
            associationId: association._id,
            userId
        }, 'Association updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(association, 'Association updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'association_update_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to update association')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete an association (soft delete by setting isActive to false)
 */
const deleteAssociation = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const association = await Association.findById(id)
        if (!association) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        association.isActive = false
        association.status = 'INACTIVE'
        association.updatedBy = userId
        await association.save()

        logger.info({
            type: 'association_deleted',
            associationId: association._id,
            userId
        }, 'Association deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(association, 'Association deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'association_delete_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to delete association')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify an association
 */
const verifyAssociation = async (req, res) => {
    try {
        const userId = req.user.id
        const { id } = req.params

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid id format. Must be a valid ObjectId', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const association = await Association.findById(id)
        if (!association) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        association.isVerified = true
        association.verifiedBy = userId
        association.verifiedAt = new Date()
        association.status = 'ACTIVE'
        association.updatedBy = userId
        await association.save()

        logger.info({
            type: 'association_verified',
            associationId: association._id,
            userId
        }, 'Association verified successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(association, 'Association verified successfully')
        )
    } catch (error) {
        logger.error({
            type: 'association_verify_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to verify association')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify association', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    createAssociation,
    getAssociations,
    getAssociationById,
    updateAssociation,
    deleteAssociation,
    verifyAssociation
}

