const logger = require('../utils/logger')

/**
 * Redis Cache Service
 * Provides caching functionality for vote counts, sessions, and rate limiting
 *
 * Note: Redis client needs to be installed: npm install redis
 * Set REDIS_URL in environment variables
 */
class CacheService {
    constructor() {
        this.client = null
        this.isConnected = false
        this.useRedis = process.env.REDIS_ENABLED === 'true' && process.env.REDIS_URL
    }

    /**
     * Initialize Redis connection
     */
    async initialize() {
        if (!this.useRedis) {
            this.memoryCache = new Map()
            return { initialized: true, type: 'memory' }
        }

        try {
            const redis = require('redis')
            this.client = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            logger.error('Redis reconnection failed after 10 retries')
                            return new Error('Redis connection failed')
                        }
                        return Math.min(retries * 100, 3000)
                    }
                }
            })

            this.client.on('error', (err) => {
                logger.error({ type: 'redis_error', error: err.message }, 'Redis client error')
                this.isConnected = false
            })

            this.client.on('connect', () => {
                this.isConnected = true
            })

            this.client.on('ready', () => {
                this.isConnected = true
            })

            await this.client.connect()
            return { initialized: true, type: 'redis' }
        } catch (error) {
            this.memoryCache = new Map()
            this.isConnected = false
            return { initialized: true, type: 'memory', fallback: true, reason: error.message }
        }
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value or null
     */
    async get(key) {
        try {
            if (this.useRedis && this.isConnected) {
                const value = await this.client.get(key)
                return value ? JSON.parse(value) : null
            } else {
                const cached = this.memoryCache.get(key)
                if (cached && cached.expiresAt > Date.now()) {
                    return cached.value
                }
                if (cached) {
                    this.memoryCache.delete(key)
                }
                return null
            }
        } catch (error) {
            logger.warn({ type: 'cache_get_error', error: error.message, key }, 'Cache get failed')
            return null
        }
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttlSeconds - Time to live in seconds
     */
    async set(key, value, ttlSeconds = 3600) {
        try {
            if (this.useRedis && this.isConnected) {
                await this.client.setEx(key, ttlSeconds, JSON.stringify(value))
            } else {
                this.memoryCache.set(key, {
                    value,
                    expiresAt: Date.now() + (ttlSeconds * 1000)
                })
            }
        } catch (error) {
            logger.warn({ type: 'cache_set_error', error: error.message, key }, 'Cache set failed')
        }
    }

    /**
     * Delete value from cache
     * @param {string} key - Cache key
     */
    async delete(key) {
        try {
            if (this.useRedis && this.isConnected) {
                await this.client.del(key)
            } else {
                this.memoryCache.delete(key)
            }
        } catch (error) {
            logger.warn({ type: 'cache_delete_error', error: error.message, key }, 'Cache delete failed')
        }
    }

    /**
     * Delete multiple keys matching pattern
     * @param {string} pattern - Key pattern
     */
    async deletePattern(pattern) {
        try {
            if (this.useRedis && this.isConnected) {
                const keys = await this.client.keys(pattern)
                if (keys.length > 0) {
                    await this.client.del(keys)
                }
            } else {
                for (const key of this.memoryCache.keys()) {
                    if (key.includes(pattern.replace('*', ''))) {
                        this.memoryCache.delete(key)
                    }
                }
            }
        } catch (error) {
            logger.warn({ type: 'cache_delete_pattern_error', error: error.message, pattern }, 'Cache delete pattern failed')
        }
    }

    /**
     * Increment value in cache
     * @param {string} key - Cache key
     * @param {number} amount - Amount to increment
     * @returns {Promise<number>} New value
     */
    async increment(key, amount = 1) {
        try {
            if (this.useRedis && this.isConnected) {
                return await this.client.incrBy(key, amount)
            } else {
                const current = await this.get(key) || 0
                const newValue = current + amount
                await this.set(key, newValue, 3600)
                return newValue
            }
        } catch (error) {
            logger.warn({ type: 'cache_increment_error', error: error.message, key }, 'Cache increment failed')
            return 0
        }
    }

    /**
     * Cache vote count for election/position
     * @param {string} electionId - Election ID
     * @param {string} positionId - Position ID
     * @param {number} count - Vote count
     * @param {number} ttlSeconds - Cache TTL
     */
    async cacheVoteCount(electionId, positionId, count, ttlSeconds = 300) {
        const key = `vote:count:${ electionId }:${ positionId }`
        await this.set(key, count, ttlSeconds)
    }

    /**
     * Get cached vote count
     * @param {string} electionId - Election ID
     * @param {string} positionId - Position ID
     * @returns {Promise<number|null>} Vote count or null
     */
    async getCachedVoteCount(electionId, positionId) {
        const key = `vote:count:${ electionId }:${ positionId }`
        return await this.get(key)
    }

    /**
     * Cache session data
     * @param {string} sessionId - Session ID
     * @param {Object} data - Session data
     * @param {number} ttlSeconds - Cache TTL
     */
    async cacheSession(sessionId, data, ttlSeconds = 3600) {
        const key = `session:${ sessionId }`
        await this.set(key, data, ttlSeconds)
    }

    /**
     * Get cached session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} Session data or null
     */
    async getCachedSession(sessionId) {
        const key = `session:${ sessionId }`
        return await this.get(key)
    }

    /**
     * Invalidate all caches for an election
     * @param {string} electionId - Election ID
     */
    async invalidateElectionCache(electionId) {
        await this.deletePattern(`vote:count:${ electionId }:*`)
        await this.deletePattern(`election:${ electionId }:*`)
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache stats
     */
    async getStats() {
        try {
            if (this.useRedis && this.isConnected) {
                const info = await this.client.info('stats')
                return {
                    connected: true,
                    type: 'redis',
                    info
                }
            } else {
                return {
                    connected: true,
                    type: 'memory',
                    size: this.memoryCache.size
                }
            }
        } catch (error) {
            return {
                connected: false,
                type: 'none',
                error: error.message
            }
        }
    }

    /**
     * Close Redis connection
     */
    async close() {
        if (this.client && this.isConnected) {
            await this.client.quit()
            this.isConnected = false
            logger.info('Redis cache service closed')
        }
    }
}

module.exports = new CacheService()

