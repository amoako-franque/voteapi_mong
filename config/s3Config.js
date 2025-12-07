const { S3Client } = require('@aws-sdk/client-s3')
const logger = require('../utils/logger')

/**
 * AWS S3 Configuration (AWS SDK v3)
 *
 * Environment variables required:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION
 * - AWS_S3_BUCKET_NAME
 * - AWS_S3_ENDPOINT (optional, for S3-compatible services)
 */

const s3Config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucketName: process.env.AWS_S3_BUCKET_NAME,
    endpoint: process.env.AWS_S3_ENDPOINT,
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true'
}

let s3Client = null

const initializeS3 = () => {
    try {
        if (!s3Config.accessKeyId || !s3Config.secretAccessKey || !s3Config.bucketName) {
            return { initialized: false, reason: 'S3 configuration incomplete' }
        }

        const clientConfig = {
            region: s3Config.region,
            credentials: {
                accessKeyId: s3Config.accessKeyId,
                secretAccessKey: s3Config.secretAccessKey
            }
        }

        if (s3Config.endpoint) {
            clientConfig.endpoint = s3Config.endpoint
            clientConfig.forcePathStyle = s3Config.forcePathStyle
        }

        s3Client = new S3Client(clientConfig)

        return {
            initialized: true,
            region: s3Config.region,
            bucket: s3Config.bucketName
        }

        return {
            initialized: true,
            region: s3Config.region,
            bucket: s3Config.bucketName
        }
    } catch (error) {
        return { initialized: false, reason: `S3 initialization failed: ${error.message}` }
    }
}

/**
 * Get S3 client instance
 */
const getS3Client = () => {
    if (!s3Client) {
        return initializeS3()
    }
    return s3Client
}

/**
 * Check if S3 is configured and available
 */
const isS3Available = () => {
    return s3Config.accessKeyId &&
        s3Config.secretAccessKey &&
        s3Config.bucketName &&
        getS3Client() !== null
}

/**
 * Generate S3 key (path) for file
 */
const generateS3Key = (folder, filename) => {
    const timestamp = Date.now()
    const randomString = require('crypto').randomBytes(8).toString('hex')
    return `${ folder }/${ timestamp }-${ randomString }-${ filename }`
}

/**
 * Get S3 URL for a file
 */
const getS3Url = (key) => {
    if (s3Config.endpoint) {
        return `${ s3Config.endpoint }/${ s3Config.bucketName }/${ key }`
    }
    return `https://${ s3Config.bucketName }.s3.${ s3Config.region }.amazonaws.com/${ key }`
}

/**
 * Get presigned URL for private files
 */
const getPresignedUrl = async (key, expiresIn = 3600) => {
    try {
        const client = getS3Client()
        if (!client) {
            throw new Error('S3 client not available')
        }

        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
        const { GetObjectCommand } = require('@aws-sdk/client-s3')

        const command = new GetObjectCommand({
            Bucket: s3Config.bucketName,
            Key: key
        })

        return await getSignedUrl(client, command, { expiresIn })
    } catch (error) {
        logger.error({
            type: 's3_presigned_url_error',
            error: error.message,
            key
        }, 'Failed to generate presigned URL')
        throw error
    }
}

module.exports = {
    s3Config,
    initializeS3,
    getS3Client,
    isS3Available,
    generateS3Key,
    getS3Url,
    getPresignedUrl
}

