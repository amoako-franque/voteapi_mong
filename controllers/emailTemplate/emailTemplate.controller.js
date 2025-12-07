const EmailTemplate = require('../../models/EmailTemplate')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS

/**
 * Get all email templates
 * GET /api/email-templates
 */
const getTemplates = async (req, res) => {
    try {
        const { category, isActive } = req.query

        const query = {}
        if (category) query.category = category
        if (isActive !== undefined) query.isActive = isActive === 'true'

        const templates = await EmailTemplate.find(query)
            .populate('createdBy', 'firstname lastname email')
            .populate('updatedBy', 'firstname lastname email')
            .sort({ createdAt: -1 })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(templates, 'Email templates retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_email_templates_error',
            error: error.message
        }, 'Failed to get email templates')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve email templates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get email template by name
 * GET /api/email-templates/:name
 */
const getTemplate = async (req, res) => {
    try {
        const { name } = req.params

        const template = await EmailTemplate.findOne({ name })
            .populate('createdBy', 'firstname lastname email')
            .populate('updatedBy', 'firstname lastname email')

        if (!template) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Email template not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(template, 'Email template retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_email_template_error',
            error: error.message
        }, 'Failed to get email template')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve email template', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Create email template
 * POST /api/email-templates
 */
const createTemplate = async (req, res) => {
    try {
        const { name, subject, htmlBody, textBody, variables, category, isDefault } = req.body

        if (!name || !subject || !htmlBody) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Name, subject, and htmlBody are required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check if template with same name exists
        const existing = await EmailTemplate.findOne({ name })
        if (existing) {
            return res.status(HTTP_STATUS.CONFLICT).json(
                responseFormatter.error('Template with this name already exists', HTTP_STATUS.CONFLICT)
            )
        }

        // If setting as default, unset other defaults in same category
        if (isDefault) {
            await EmailTemplate.updateMany(
                { category: category || 'CUSTOM', isDefault: true },
                { isDefault: false }
            )
        }

        const template = new EmailTemplate({
            name,
            subject,
            htmlBody,
            textBody,
            variables: variables || [],
            category: category || 'CUSTOM',
            isDefault: isDefault || false,
            createdBy: req.user._id
        })

        await template.save()

        logger.info({
            type: 'email_template_created',
            templateId: template._id,
            name: template.name,
            userId: req.user._id
        }, 'Email template created')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.success(template, 'Email template created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'create_email_template_error',
            error: error.message
        }, 'Failed to create email template')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to create email template', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update email template
 * PUT /api/email-templates/:name
 */
const updateTemplate = async (req, res) => {
    try {
        const { name } = req.params
        const { subject, htmlBody, textBody, variables, category, isDefault, isActive } = req.body

        const template = await EmailTemplate.findOne({ name })
        if (!template) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Email template not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Update fields
        if (subject !== undefined) template.subject = subject
        if (htmlBody !== undefined) template.htmlBody = htmlBody
        if (textBody !== undefined) template.textBody = textBody
        if (variables !== undefined) template.variables = variables
        if (category !== undefined) template.category = category
        if (isActive !== undefined) template.isActive = isActive
        if (isDefault !== undefined) {
            template.isDefault = isDefault
            // If setting as default, unset other defaults in same category
            if (isDefault) {
                await EmailTemplate.updateMany(
                    { category: template.category, isDefault: true, _id: { $ne: template._id } },
                    { isDefault: false }
                )
            }
        }

        template.updatedBy = req.user._id
        await template.save()

        logger.info({
            type: 'email_template_updated',
            templateId: template._id,
            name: template.name,
            userId: req.user._id
        }, 'Email template updated')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(template, 'Email template updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'update_email_template_error',
            error: error.message
        }, 'Failed to update email template')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to update email template', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete email template
 * DELETE /api/email-templates/:name
 */
const deleteTemplate = async (req, res) => {
    try {
        const { name } = req.params

        const template = await EmailTemplate.findOne({ name })
        if (!template) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Email template not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Prevent deletion of default templates
        if (template.isDefault) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot delete default template', HTTP_STATUS.BAD_REQUEST)
            )
        }

        await template.deleteOne()

        logger.info({
            type: 'email_template_deleted',
            templateId: template._id,
            name: template.name,
            userId: req.user._id
        }, 'Email template deleted')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Email template deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'delete_email_template_error',
            error: error.message
        }, 'Failed to delete email template')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete email template', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate
}

