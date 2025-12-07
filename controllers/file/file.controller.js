const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const fileUploadService = require('../../services/fileUploadService')
const path = require('path')
const fs = require('fs').promises

/**
 * Upload image
 * POST /api/upload/image
 */
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('No image file provided', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const fileUrl = fileUploadService.generateFileUrl(req.file.path)
        const fileInfo = await fileUploadService.getFileInfo(req.file.path)

        logger.info({
            type: 'image_uploaded',
            userId: req.user?.id,
            filename: req.file.filename,
            size: req.file.size
        }, 'Image uploaded successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created({
                file: {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    url: fileUrl,
                    path: req.file.path,
                    info: fileInfo
                }
            }, 'Image uploaded successfully')
        )
    } catch (error) {
        logger.error({
            type: 'upload_image_error',
            error: error.message,
            userId: req.user?.id
        }, 'Failed to upload image')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to upload image', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Upload document
 * POST /api/upload/document
 */
const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('No document file provided', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const fileUrl = fileUploadService.generateFileUrl(req.file.path)
        const fileInfo = await fileUploadService.getFileInfo(req.file.path)

        logger.info({
            type: 'document_uploaded',
            userId: req.user?.id,
            filename: req.file.filename,
            size: req.file.size
        }, 'Document uploaded successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created({
                file: {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    url: fileUrl,
                    path: req.file.path,
                    info: fileInfo
                }
            }, 'Document uploaded successfully')
        )
    } catch (error) {
        logger.error({
            type: 'upload_document_error',
            error: error.message,
            userId: req.user?.id
        }, 'Failed to upload document')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to upload document', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get file
 * GET /api/files/*
 */
const getFile = async (req, res) => {
    try {
        // Get the full path from regex match (Express 5 regex route)
        // The regex captures everything after /files/
        const match = req.path.match(/^\/files\/(.+)$/)
        const filePath = match ? match[1] : ''
        const fullPath = path.join(fileUploadService.uploadDir, filePath)

        // Security: Prevent directory traversal
        const normalizedPath = path.normalize(fullPath)
        if (!normalizedPath.startsWith(path.resolve(fileUploadService.uploadDir))) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Access denied', HTTP_STATUS.FORBIDDEN)
            )
        }

        try {
            const stats = await fs.stat(normalizedPath)
            if (!stats.isFile()) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('File not found', HTTP_STATUS.NOT_FOUND)
                )
            }

            // Determine content type
            const ext = path.extname(normalizedPath).toLowerCase()
            const contentTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }

            const contentType = contentTypes[ext] || 'application/octet-stream'

            res.setHeader('Content-Type', contentType)
            res.setHeader('Content-Length', stats.size)
            res.setHeader('Content-Disposition', `inline; filename="${ path.basename(normalizedPath) }"`)

            const fileStream = require('fs').createReadStream(normalizedPath)
            fileStream.pipe(res)
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('File not found', HTTP_STATUS.NOT_FOUND)
                )
            }
            throw error
        }
    } catch (error) {
        logger.error({
            type: 'get_file_error',
            error: error.message,
            filePath: req.params[0]
        }, 'Failed to get file')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to retrieve file', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete file
 * DELETE /api/files/*
 */
const deleteFile = async (req, res) => {
    try {
        const match = req.path.match(/^\/files\/(.+)$/)
        const filePath = match ? match[1] : ''
        const fullPath = path.join(fileUploadService.uploadDir, filePath)

        // Security: Prevent directory traversal
        const normalizedPath = path.normalize(fullPath)
        if (!normalizedPath.startsWith(path.resolve(fileUploadService.uploadDir))) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Access denied', HTTP_STATUS.FORBIDDEN)
            )
        }

        const deleted = await fileUploadService.deleteFile(normalizedPath)

        if (!deleted) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('File not found or could not be deleted', HTTP_STATUS.NOT_FOUND)
            )
        }

        logger.info({
            type: 'file_deleted',
            userId: req.user?.id,
            filePath
        }, 'File deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'File deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'delete_file_error',
            error: error.message,
            userId: req.user?.id,
            filePath: req.params[0]
        }, 'Failed to delete file')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to delete file', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    uploadImage,
    uploadDocument,
    getFile,
    deleteFile
}

