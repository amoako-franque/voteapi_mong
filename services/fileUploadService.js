const multer = require('multer')
const path = require('path')
const fs = require('fs').promises
const crypto = require('crypto')
const logger = require('../utils/logger')

class FileUploadService {
    constructor() {
        this.uploadDir = process.env.UPLOAD_DIR || './uploads'
        this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024
        this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        this.allowedDocumentTypes = ['application/pdf', 'application/msword',]

        // Initialize upload directory
        this.initializeUploadDir()
    }

    /**
     * Initialize upload directory structure
     */
    async initializeUploadDir() {
        try {
            const dirs = [
                this.uploadDir,
                path.join(this.uploadDir, 'images'),
                path.join(this.uploadDir, 'documents'),
                path.join(this.uploadDir, 'temp')
            ]

            for (const dir of dirs) {
                try {
                    await fs.access(dir)
                } catch {
                    await fs.mkdir(dir, { recursive: true })
                    logger.info({ type: 'upload_dir_created', directory: dir }, 'Upload directory created')
                }
            }
        } catch (error) {
            logger.error({
                type: 'upload_dir_init_error',
                error: error.message
            }, 'Failed to initialize upload directory')
        }
    }

    /**
     * Configure multer storage for images
     */
    getImageStorage() {
        return multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, path.join(this.uploadDir, 'images'))
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = `${ Date.now() }-${ crypto.randomBytes(8).toString('hex') }`
                const ext = path.extname(file.originalname)
                cb(null, `img-${ uniqueSuffix }${ ext }`)
            }
        })
    }

    /**
     * Configure multer storage for documents
     */
    getDocumentStorage() {
        return multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, path.join(this.uploadDir, 'documents'))
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = `${ Date.now() }-${ crypto.randomBytes(8).toString('hex') }`
                const ext = path.extname(file.originalname)
                cb(null, `doc-${ uniqueSuffix }${ ext }`)
            }
        })
    }

    /**
     * File filter for images
     */
    imageFilter(req, file, cb) {
        if (this.allowedImageTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error(`Invalid file type. Allowed types: ${ this.allowedImageTypes.join(', ') }`), false)
        }
    }

    /**
     * File filter for documents
     */
    documentFilter(req, file, cb) {
        if (this.allowedDocumentTypes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error(`Invalid file type. Allowed types: ${ this.allowedDocumentTypes.join(', ') }`), false)
        }
    }

    /**
     * Get multer instance for image uploads
     */
    getImageUpload() {
        return multer({
            storage: this.getImageStorage(),
            limits: {
                fileSize: this.maxFileSize
            },
            fileFilter: this.imageFilter.bind(this)
        })
    }

    /**
     * Get multer instance for document uploads
     */
    getDocumentUpload() {
        return multer({
            storage: this.getDocumentStorage(),
            limits: {
                fileSize: this.maxFileSize * 2 // Documents can be larger
            },
            fileFilter: this.documentFilter.bind(this)
        })
    }

    /**
     * Validate file
     */
    validateFile(file, allowedTypes, maxSize) {
        const errors = []

        if (!file) {
            errors.push('No file provided')
            return { valid: false, errors }
        }

        if (!allowedTypes.includes(file.mimetype)) {
            errors.push(`Invalid file type. Allowed: ${ allowedTypes.join(', ') }`)
        }

        if (file.size > maxSize) {
            errors.push(`File size exceeds maximum allowed size of ${ maxSize / 1024 / 1024 }MB`)
        }

        return {
            valid: errors.length === 0,
            errors
        }
    }

    /**
     * Get file info
     */
    async getFileInfo(filePath) {
        try {
            const stats = await fs.stat(filePath)
            return {
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                isFile: stats.isFile()
            }
        } catch (error) {
            logger.error({
                type: 'get_file_info_error',
                error: error.message,
                filePath
            }, 'Failed to get file info')
            return null
        }
    }

    /**
     * Delete file
     */
    async deleteFile(filePath) {
        try {
            await fs.unlink(filePath)
            logger.info({
                type: 'file_deleted',
                filePath
            }, 'File deleted successfully')
            return true
        } catch (error) {
            logger.error({
                type: 'delete_file_error',
                error: error.message,
                filePath
            }, 'Failed to delete file')
            return false
        }
    }

    /**
     * Generate file URL
     */
    generateFileUrl(filePath) {
        const relativePath = path.relative(this.uploadDir, filePath)
        return `/api/files/${ relativePath.replace(/\\/g, '/') }`
    }

    /**
     * Clean up temporary files older than specified hours
     */
    async cleanupTempFiles(maxAgeHours = 24) {
        try {
            const tempDir = path.join(this.uploadDir, 'temp')
            const files = await fs.readdir(tempDir)
            const now = Date.now()
            const maxAge = maxAgeHours * 60 * 60 * 1000

            let deletedCount = 0

            for (const file of files) {
                const filePath = path.join(tempDir, file)
                const stats = await fs.stat(filePath)
                const age = now - stats.mtime.getTime()

                if (age > maxAge) {
                    await this.deleteFile(filePath)
                    deletedCount++
                }
            }

            logger.info({
                type: 'temp_files_cleanup',
                deletedCount,
                maxAgeHours
            }, `Cleaned up ${ deletedCount } temporary files`)

            return deletedCount
        } catch (error) {
            logger.error({
                type: 'cleanup_temp_files_error',
                error: error.message
            }, 'Failed to cleanup temporary files')
            return 0
        }
    }
}

module.exports = new FileUploadService()

