const sharp = require('sharp')
const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const logger = require('../utils/logger')
const { getS3Client, isS3Available, generateS3Key, getS3Url } = require('../config/s3Config')
const { getCloudinary, isCloudinaryAvailable, extractPublicId } = require('../config/cloudinaryConfig')

/**
 * Image Upload Service
 * Supports: Local storage, AWS S3, and Cloudinary
 * Features: Image resizing, format conversion, optimization
 */

class ImageUploadService {
    constructor() {
        // Standard candidate profile image dimensions
        this.CANDIDATE_PROFILE_SIZE = {
            width: 400,
            height: 400,
            fit: 'cover' // 'cover', 'contain', 'fill', 'inside', 'outside'
        }

        // Image quality settings
        this.IMAGE_QUALITY = {
            jpeg: 85,
            png: 90,
            webp: 85
        }

        // Storage preference (LOCAL, S3, CLOUDINARY, or 'auto' to use first available)
        this.storagePreference = process.env.IMAGE_STORAGE_TYPE || 'auto'
    }

    /**
     * Determine which storage to use
     */
    getStorageType() {
        if (this.storagePreference === 'auto') {
            // Priority: Cloudinary > S3 > Local
            if (isCloudinaryAvailable()) return 'CLOUDINARY'
            if (isS3Available()) return 'S3'
            return 'LOCAL'
        }

        if (this.storagePreference === 'CLOUDINARY' && isCloudinaryAvailable()) return 'CLOUDINARY'
        if (this.storagePreference === 'S3' && isS3Available()) return 'S3'
        return 'LOCAL'
    }

    /**
     * Resize and optimize image
     */
    async resizeAndOptimizeImage(inputPath, options = {}) {
        try {
            const {
                width = this.CANDIDATE_PROFILE_SIZE.width,
                height = this.CANDIDATE_PROFILE_SIZE.height,
                fit = this.CANDIDATE_PROFILE_SIZE.fit,
                format = 'jpeg',
                quality = this.IMAGE_QUALITY.jpeg
            } = options

            const outputPath = path.join(
                path.dirname(inputPath),
                `resized-${ Date.now() }-${ crypto.randomBytes(4).toString('hex') }.${ format }`
            )

            const image = sharp(inputPath)
            const metadata = await image.metadata()

            // Resize image
            await image
                .resize(width, height, {
                    fit,
                    position: 'center',
                    background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for cover
                })
                .toFormat(format, {
                    quality,
                    progressive: format === 'jpeg'
                })
                .toFile(outputPath)

            // Get resized image metadata
            const resizedMetadata = await sharp(outputPath).metadata()

            return {
                path: outputPath,
                width: resizedMetadata.width,
                height: resizedMetadata.height,
                size: (await fs.stat(outputPath)).size,
                format: resizedMetadata.format,
                mimeType: `image/${ format }`
            }
        } catch (error) {
            logger.error({
                type: 'image_resize_error',
                error: error.message,
                inputPath
            }, 'Failed to resize image')
            throw error
        }
    }

    /**
     * Upload image to S3 (AWS SDK v3)
     */
    async uploadToS3(filePath, folder = 'candidates') {
        try {
            const s3Client = getS3Client()
            if (!s3Client) {
                throw new Error('S3 client not available')
            }

            const { PutObjectCommand } = require('@aws-sdk/client-s3')

            const filename = path.basename(filePath)
            const key = generateS3Key(folder, filename)
            const fileContent = await fs.readFile(filePath)
            const stats = await fs.stat(filePath)
            const ext = path.extname(filePath).slice(1).toLowerCase()
            const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ ext }`

            // Get image dimensions
            const metadata = await sharp(filePath).metadata()

            const command = new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key,
                Body: fileContent,
                ContentType: mimeType,
                ACL: 'public-read', // Make publicly accessible
                CacheControl: 'max-age=31536000' // Cache for 1 year
            })

            await s3Client.send(command)
            const url = getS3Url(key)

            return {
                url,
                s3Key: key,
                storageType: 'S3',
                uniqueId: key,
                width: metadata.width,
                height: metadata.height,
                size: stats.size,
                mimeType
            }
        } catch (error) {
            logger.error({
                type: 's3_upload_error',
                error: error.message,
                filePath
            }, 'Failed to upload to S3')
            throw error
        }
    }

    /**
     * Upload image to Cloudinary
     */
    async uploadToCloudinary(filePath, folder = 'candidates') {
        try {
            const cloudinary = getCloudinary()
            if (!cloudinary) {
                throw new Error('Cloudinary not available')
            }

            const uniqueId = `${ Date.now() }-${ crypto.randomBytes(8).toString('hex') }`
            const publicId = `${ folder }/${ uniqueId }`

            const result = await cloudinary.uploader.upload(filePath, {
                folder: folder,
                public_id: uniqueId,
                overwrite: false,
                resource_type: 'image',
                transformation: [
                    {
                        width: this.CANDIDATE_PROFILE_SIZE.width,
                        height: this.CANDIDATE_PROFILE_SIZE.height,
                        crop: 'fill',
                        gravity: 'face', // Focus on faces if detected
                        quality: 'auto',
                        fetch_format: 'auto'
                    }
                ],
                tags: ['candidate', 'profile']
            })

            return {
                url: result.secure_url,
                cloudinaryPublicId: result.public_id,
                storageType: 'CLOUDINARY',
                uniqueId: result.public_id,
                width: result.width,
                height: result.height,
                size: result.bytes,
                format: result.format
            }
        } catch (error) {
            logger.error({
                type: 'cloudinary_upload_error',
                error: error.message,
                filePath
            }, 'Failed to upload to Cloudinary')
            throw error
        }
    }

    /**
     * Upload image to local storage
     */
    async uploadToLocal(filePath, folder = 'candidates') {
        try {
            const uploadDir = process.env.UPLOAD_DIR || './uploads'
            const targetDir = path.join(uploadDir, 'images', folder)

            // Ensure directory exists
            await fs.mkdir(targetDir, { recursive: true })

            const filename = path.basename(filePath)
            const targetPath = path.join(targetDir, filename)

            // Move file to target location
            await fs.rename(filePath, targetPath)

            // Get image metadata
            const metadata = await sharp(targetPath).metadata()
            const stats = await fs.stat(targetPath)

            const url = `/api/files/images/${ folder }/${ filename }`
            const uniqueId = filename

            return {
                url,
                path: targetPath,
                storageType: 'LOCAL',
                uniqueId,
                width: metadata.width,
                height: metadata.height,
                size: stats.size,
                mimeType: `image/${ metadata.format }`
            }
        } catch (error) {
            logger.error({
                type: 'local_upload_error',
                error: error.message,
                filePath
            }, 'Failed to upload to local storage')
            throw error
        }
    }

    /**
     * Upload candidate profile image
     * Handles resizing, optimization, and storage
     */
    async uploadCandidateProfileImage(filePath, options = {}) {
        try {
            // Resize and optimize image
            const resized = await this.resizeAndOptimizeImage(filePath, {
                width: this.CANDIDATE_PROFILE_SIZE.width,
                height: this.CANDIDATE_PROFILE_SIZE.height,
                fit: this.CANDIDATE_PROFILE_SIZE.fit,
                format: 'jpeg',
                quality: this.IMAGE_QUALITY.jpeg
            })

            const storageType = this.getStorageType()
            let uploadResult

            // Upload to selected storage
            switch (storageType) {
                case 'CLOUDINARY':
                    uploadResult = await this.uploadToCloudinary(resized.path, 'candidates')
                    break
                case 'S3':
                    uploadResult = await this.uploadToS3(resized.path, 'candidates')
                    break
                default:
                    uploadResult = await this.uploadToLocal(resized.path, 'candidates')
            }

            // Clean up temporary resized file if it's different from original
            if (resized.path !== filePath) {
                try {
                    await fs.unlink(resized.path)
                } catch (error) {
                    logger.warn({
                        type: 'temp_file_cleanup_warning',
                        error: error.message,
                        path: resized.path
                    }, 'Failed to cleanup temporary file')
                }
            }

            return {
                ...uploadResult,
                width: resized.width,
                height: resized.height,
                size: resized.size,
                mimeType: resized.mimeType,
                uploadedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'candidate_image_upload_error',
                error: error.message,
                filePath
            }, 'Failed to upload candidate profile image')
            throw error
        }
    }

    /**
     * Delete image from S3 (AWS SDK v3)
     */
    async deleteFromS3(s3Key) {
        try {
            const s3Client = getS3Client()
            if (!s3Client) {
                throw new Error('S3 client not available')
            }

            const { DeleteObjectCommand } = require('@aws-sdk/client-s3')

            const command = new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: s3Key
            })

            await s3Client.send(command)

            logger.info({
                type: 's3_image_deleted',
                s3Key
            }, 'Image deleted from S3')

            return true
        } catch (error) {
            logger.error({
                type: 's3_delete_error',
                error: error.message,
                s3Key
            }, 'Failed to delete from S3')
            return false
        }
    }

    /**
     * Delete image from Cloudinary
     */
    async deleteFromCloudinary(publicId) {
        try {
            const cloudinary = getCloudinary()
            if (!cloudinary) {
                throw new Error('Cloudinary not available')
            }

            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: 'image'
            })

            if (result.result === 'ok') {
                logger.info({
                    type: 'cloudinary_image_deleted',
                    publicId
                }, 'Image deleted from Cloudinary')
                return true
            } else {
                logger.warn({
                    type: 'cloudinary_delete_warning',
                    publicId,
                    result: result.result
                }, 'Cloudinary deletion returned unexpected result')
                return false
            }
        } catch (error) {
            logger.error({
                type: 'cloudinary_delete_error',
                error: error.message,
                publicId
            }, 'Failed to delete from Cloudinary')
            return false
        }
    }

    /**
     * Delete image from local storage
     */
    async deleteFromLocal(filePath) {
        try {
            await fs.unlink(filePath)
            logger.info({
                type: 'local_image_deleted',
                filePath
            }, 'Image deleted from local storage')
            return true
        } catch (error) {
            // File might not exist, which is okay
            if (error.code === 'ENOENT') {
                logger.warn({
                    type: 'local_file_not_found',
                    filePath
                }, 'File not found for deletion')
                return true // Consider it successful
            }
            logger.error({
                type: 'local_delete_error',
                error: error.message,
                filePath
            }, 'Failed to delete from local storage')
            return false
        }
    }

    /**
     * Delete candidate profile image
     * Handles deletion from all storage types
     */
    async deleteCandidateProfileImage(imageData) {
        try {
            if (!imageData || !imageData.storageType) {
                logger.warn({
                    type: 'delete_image_no_data',
                    imageData
                }, 'No image data provided for deletion')
                return false
            }

            let deleted = false

            switch (imageData.storageType) {
                case 'S3':
                    if (imageData.s3Key) {
                        deleted = await this.deleteFromS3(imageData.s3Key)
                    }
                    break
                case 'CLOUDINARY':
                    if (imageData.cloudinaryPublicId) {
                        deleted = await this.deleteFromCloudinary(imageData.cloudinaryPublicId)
                    } else if (imageData.url) {
                        // Try to extract public ID from URL
                        const publicId = extractPublicId(imageData.url)
                        if (publicId) {
                            deleted = await this.deleteFromCloudinary(publicId)
                        }
                    }
                    break
                case 'LOCAL':
                    if (imageData.path) {
                        deleted = await this.deleteFromLocal(imageData.path)
                    } else if (imageData.url) {
                        // Extract path from URL
                        const uploadDir = process.env.UPLOAD_DIR || './uploads'
                        const relativePath = imageData.url.replace('/api/files/', '')
                        const filePath = path.join(uploadDir, relativePath)
                        deleted = await this.deleteFromLocal(filePath)
                    }
                    break
                default:
                    logger.warn({
                        type: 'unknown_storage_type',
                        storageType: imageData.storageType
                    }, 'Unknown storage type for deletion')
            }

            return deleted
        } catch (error) {
            logger.error({
                type: 'delete_candidate_image_error',
                error: error.message,
                imageData
            }, 'Failed to delete candidate profile image')
            return false
        }
    }
}

module.exports = new ImageUploadService()

