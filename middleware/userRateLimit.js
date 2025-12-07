const rateLimit = require('express-rate-limit')
const { RateLimiterRedis } = require('rate-limit-redis')
const cacheService = require('../services/cacheService')
const logger = require('../utils/logger')

/**
 * Create Redis store adapter for rate-limit-redis
 */
const createRedisStore = () => {
    if (!cacheService.client || !cacheService.isConnected) {
        return null
    }

    return new RateLimiterRedis({
        sendCommand: async (...args) => {
            try {
                const [command, ...commandArgs] = args
                return await cacheService.client[command.toLowerCase()](...commandArgs)
            } catch (error) {
                logger.error({
                    type: 'redis_rate_limit_error',
                    error: error.message
                }, 'Redis rate limit command failed')
                throw error
            }
        }
    })
}

/**
 * Create per-user rate limiter
 * Uses Redis if available, otherwise falls back to memory
 */
const createUserRateLimiter = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    const redisStore = createRedisStore()
    const useRedis = redisStore !== null

    const config = {
        windowMs,
        max: maxRequests,
        keyGenerator: (req) => {
            // Use user ID if authenticated, otherwise use IP
            return req.user?._id
                ? `rate_limit:user:${req.user._id}`
                : `rate_limit:ip:${req.ip}`
        },
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(windowMs / 1000)
        },
        handler: (req, res) => {
            logger.warn({
                type: 'user_rate_limit_exceeded',
                userId: req.user?._id,
                ip: req.ip,
                endpoint: req.path,
                method: req.method
            }, 'User rate limit exceeded')

            res.status(429).json({
                success: false,
                error: 'Too many requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: Math.ceil(windowMs / 1000)
            })
        },
        skip: (req) => {
            // Skip rate limiting for health checks
            return req.path === '/health' || req.path === '/api'
        }
    }

    // Add Redis store if available
    if (useRedis) {
        config.store = redisStore
    }

    return rateLimit(config)
}

/**
 * Default per-user rate limiter
 * 100 requests per 15 minutes per user
 */
const userRateLimiter = createUserRateLimiter(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_USER) || 100
)

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per 15 minutes per user
 */
const strictUserRateLimiter = createUserRateLimiter(
    15 * 60 * 1000,
    10
)

/**
 * Moderate rate limiter for regular operations
 * 50 requests per 15 minutes per user
 */
const moderateUserRateLimiter = createUserRateLimiter(
    15 * 60 * 1000,
    50
)

module.exports = {
    userRateLimiter,
    strictUserRateLimiter,
    moderateUserRateLimiter,
    createUserRateLimiter
}

