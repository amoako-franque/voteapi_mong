const rateLimit = require('express-rate-limit')
const RedisStore = require('rate-limit-redis')
const redis = require('redis')
const logger = require('../utils/logger')

/**
 * Create per-user rate limiter
 * Uses Redis if available, falls back to in-memory store
 */
function createUserRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        max = 100, // requests per window
        message = 'Too many requests from this user, please try again later.',
        skipSuccessfulRequests = false,
        skipFailedRequests = false
    } = options

    // Check if Redis is enabled
    const useRedis = process.env.REDIS_ENABLED === 'true' && process.env.REDIS_URL

    let store

    if (useRedis) {
        try {
            const redisClient = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            logger.warn('Redis reconnection failed, falling back to memory store')
                            return false
                        }
                        return Math.min(retries * 100, 3000)
                    }
                }
            })

            store = new RedisStore({
                client: redisClient,
                prefix: 'rl:user:'
            })

            // Handle Redis connection errors
            redisClient.on('error', (err) => {
                logger.error({
                    type: 'redis_rate_limit_error',
                    error: err.message
                }, 'Redis error in rate limiter, falling back to memory')
            })
        } catch (error) {
            logger.warn({
                type: 'redis_rate_limit_init_error',
                error: error.message
            }, 'Failed to initialize Redis for rate limiting, using memory store')
        }
    }

    return rateLimit({
        windowMs,
        max,
        message,
        store,
        skipSuccessfulRequests,
        skipFailedRequests,
        standardHeaders: true,
        legacyHeaders: false,
        // Use user ID as key if authenticated, otherwise use IP
        keyGenerator: (req) => {
            if (req.user && req.user._id) {
                return `user:${req.user._id}`
            }
            return `ip:${req.ip || req.connection.remoteAddress}`
        },
        handler: (req, res) => {
            logger.warn({
                type: 'rate_limit_exceeded',
                userId: req.user?._id,
                ip: req.ip,
                path: req.path,
                method: req.method
            }, 'Rate limit exceeded for user')

            res.status(429).json({
                success: false,
                error: message,
                retryAfter: Math.ceil(windowMs / 1000)
            })
        },
        skip: (req) => {
            // Skip rate limiting for health checks
            return req.path === '/health' || req.path === '/api/health'
        }
    })
}

/**
 * Default per-user rate limiter (100 requests per 15 minutes)
 */
const userRateLimiter = createUserRateLimiter()

/**
 * Strict rate limiter (50 requests per 15 minutes)
 */
const strictUserRateLimiter = createUserRateLimiter({
    max: 50,
    windowMs: 15 * 60 * 1000
})

/**
 * Lenient rate limiter (200 requests per 15 minutes)
 */
const lenientUserRateLimiter = createUserRateLimiter({
    max: 200,
    windowMs: 15 * 60 * 1000
})

/**
 * API rate limiter (1000 requests per hour)
 */
const apiRateLimiter = createUserRateLimiter({
    max: 1000,
    windowMs: 60 * 60 * 1000
})

module.exports = {
    userRateLimiter,
    strictUserRateLimiter,
    lenientUserRateLimiter,
    apiRateLimiter,
    createUserRateLimiter
}

