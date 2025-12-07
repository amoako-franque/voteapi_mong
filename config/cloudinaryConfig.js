const cloudinary = require('cloudinary').v2
const logger = require('../utils/logger')

/**
 * Cloudinary Configuration
 *
 * Environment variables required:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 */

const cloudinaryConfig = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    secure: true
}

// Initialize Cloudinary
let isInitialized = false

const initializeCloudinary = () => {
    try {
        if (!cloudinaryConfig.cloudName || !cloudinaryConfig.apiKey || !cloudinaryConfig.apiSecret) {
            return { initialized: false, reason: 'Cloudinary configuration incomplete' }
        }

        cloudinary.config({
            cloud_name: cloudinaryConfig.cloudName,
            api_key: cloudinaryConfig.apiKey,
            api_secret: cloudinaryConfig.apiSecret,
            secure: cloudinaryConfig.secure
        })

        isInitialized = true

        return {
            initialized: true,
            cloudName: cloudinaryConfig.cloudName
        }
    } catch (error) {
        return { initialized: false, reason: `Cloudinary initialization failed: ${error.message}` }
    }
}

/**
 * Check if Cloudinary is configured and available
 */
const isCloudinaryAvailable = () => {
    if (!isInitialized) {
        return initializeCloudinary()
    }
    return isInitialized &&
        cloudinaryConfig.cloudName &&
        cloudinaryConfig.apiKey &&
        cloudinaryConfig.apiSecret
}

/**
 * Get Cloudinary instance
 */
const getCloudinary = () => {
    if (!isInitialized) {
        initializeCloudinary()
    }
    return isCloudinaryAvailable() ? cloudinary : null
}

/**
 * Extract public ID from Cloudinary URL
 */
const extractPublicId = (url) => {
    try {
        // Cloudinary URLs format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{public_id}.{format}
        const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/)
        return match ? match[1] : null
    } catch (error) {
        logger.error({
            type: 'extract_cloudinary_public_id_error',
            error: error.message,
            url
        }, 'Failed to extract Cloudinary public ID')
        return null
    }
}

module.exports = {
    cloudinaryConfig,
    initializeCloudinary,
    isCloudinaryAvailable,
    getCloudinary,
    extractPublicId
}

