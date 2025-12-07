const logger = require('../utils/logger')
const axios = require('axios')
const crypto = require('crypto')
const Webhook = require('../models/Webhook')

/**
 * Integration Service
 * Handles webhooks, third-party API integrations, and external system sync
 */
class IntegrationService {
    constructor() {
        // Load webhooks from database on initialization
        this.loadWebhooks()
    }

    /**
     * Load webhooks from database
     */
    async loadWebhooks() {
        try {
            const webhooks = await Webhook.find({ active: true })
            logger.info({
                type: 'webhooks_loaded',
                count: webhooks.length
            }, `Loaded ${ webhooks.length } active webhooks from database`)
        } catch (error) {
            logger.error({
                type: 'webhooks_load_error',
                error: error.message
            }, 'Failed to load webhooks from database')
        }
    }

    /**
     * Register a webhook
     * @param {string} event - Event type (e.g., 'vote.cast', 'election.completed')
     * @param {string} url - Webhook URL
     * @param {Object} options - Webhook options
     * @param {string} userId - User ID creating the webhook
     * @returns {Promise<string>} Webhook ID
     */
    async registerWebhook(event, url, options = {}, userId = null) {
        try {
            const secret = options.secret || crypto.randomBytes(32).toString('hex')

            const webhook = await Webhook.create({
                event,
                url,
                secret,
                active: true,
                retries: 0,
                maxRetries: options.maxRetries || 3,
                timeout: options.timeout || 5000,
                headers: options.headers || {},
                createdBy: userId,
                metadata: options.metadata || {}
            })

            logger.info({
                type: 'webhook_registered',
                webhookId: webhook._id.toString(),
                event,
                url
            }, 'Webhook registered')

            return webhook._id.toString()
        } catch (error) {
            logger.error({
                type: 'webhook_register_error',
                error: error.message
            }, 'Failed to register webhook')
            throw error
        }
    }

    /**
     * Unregister a webhook
     * @param {string} webhookId - Webhook ID
     */
    async unregisterWebhook(webhookId) {
        try {
            const webhook = await Webhook.findById(webhookId)
            if (!webhook) {
                throw new Error('Webhook not found')
            }

            webhook.active = false
            await webhook.save()

            logger.info({ webhookId }, 'Webhook unregistered')
        } catch (error) {
            logger.error({
                type: 'webhook_unregister_error',
                webhookId,
                error: error.message
            }, 'Failed to unregister webhook')
            throw error
        }
    }

    /**
     * Trigger webhooks for an event
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    async triggerWebhooks(event, data) {
        try {
            const webhooks = await Webhook.find({
                event,
                active: true
            })

            if (webhooks.length === 0) {
                return
            }

            logger.debug({
                type: 'webhook_trigger',
                event,
                count: webhooks.length
            }, `Triggering ${ webhooks.length } webhook(s) for event: ${ event }`)

            // Trigger webhooks in parallel (don't wait for responses)
            webhooks.forEach(webhook => {
                this.sendWebhook(webhook, data).catch(error => {
                    logger.error({
                        type: 'webhook_send_error',
                        webhookId: webhook._id.toString(),
                        error: error.message
                    }, 'Failed to send webhook')
                })
            })
        } catch (error) {
            logger.error({
                type: 'webhook_trigger_error',
                event,
                error: error.message
            }, 'Failed to trigger webhooks')
        }
    }

    /**
     * Send webhook request
     * @param {Object} webhook - Webhook document
     * @param {Object} data - Event data
     */
    async sendWebhook(webhook, data) {
        try {
            const payload = {
                event: webhook.event,
                timestamp: new Date().toISOString(),
                data
            }

            // Generate signature
            const signature = this.generateSignature(JSON.stringify(payload), webhook.secret)

            const response = await axios.post(webhook.url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Id': webhook._id.toString(),
                    ...webhook.headers
                },
                timeout: webhook.timeout,
                validateStatus: (status) => status < 500 // Don't throw on 4xx
            })

            if (response.status >= 200 && response.status < 300) {
                logger.debug({
                    webhookId: webhook._id.toString(),
                    status: response.status
                }, 'Webhook sent successfully')

                // Update webhook stats
                webhook.retries = 0
                webhook.lastTriggeredAt = new Date()
                webhook.lastSuccessAt = new Date()
                webhook.totalTriggers += 1
                webhook.totalSuccesses += 1
                await webhook.save()
            } else {
                throw new Error(`Webhook returned status ${ response.status }`)
            }
        } catch (error) {
            webhook.retries += 1
            webhook.lastTriggeredAt = new Date()
            webhook.lastFailureAt = new Date()
            webhook.totalTriggers += 1
            webhook.totalFailures += 1

            logger.warn({
                type: 'webhook_send_failed',
                webhookId: webhook._id.toString(),
                retries: webhook.retries,
                error: error.message
            }, 'Webhook send failed')

            // Retry if under max retries
            if (webhook.retries < webhook.maxRetries) {
                await webhook.save()
                setTimeout(() => {
                    this.sendWebhook(webhook, data)
                }, 1000 * webhook.retries) // Exponential backoff
            } else {
                logger.error({
                    webhookId: webhook._id.toString()
                }, 'Webhook max retries exceeded, deactivating')
                webhook.active = false
                await webhook.save()
            }
        }
    }

    /**
     * Generate webhook signature
     * @param {string} payload - Payload string
     * @param {string} secret - Webhook secret
     * @returns {string} Signature
     */
    generateSignature(payload, secret) {
        return crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')
    }

    /**
     * Verify webhook signature
     * @param {string} payload - Payload string
     * @param {string} signature - Received signature
     * @param {string} secret - Webhook secret
     * @returns {boolean} True if valid
     */
    verifySignature(payload, signature, secret) {
        const expectedSignature = this.generateSignature(payload, secret)
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        )
    }

    /**
     * Sync with external system
     * @param {string} system - System name
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Data to sync
     * @param {Object} options - Sync options
     */
    async syncExternalSystem(system, endpoint, data, options = {}) {
        try {
            const config = {
                method: options.method || 'POST',
                url: endpoint,
                data,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                timeout: options.timeout || 10000
            }

            // Add authentication if provided
            if (options.apiKey) {
                config.headers['X-API-Key'] = options.apiKey
            }
            if (options.bearerToken) {
                config.headers['Authorization'] = `Bearer ${ options.bearerToken }`
            }

            const response = await axios(config)

            logger.info({
                type: 'external_sync_success',
                system,
                endpoint,
                status: response.status
            }, `Synced with ${ system }`)

            return response.data
        } catch (error) {
            logger.error({
                type: 'external_sync_error',
                system,
                endpoint,
                error: error.message
            }, `Failed to sync with ${ system }`)
            throw error
        }
    }

    /**
     * Get registered webhooks
     * @param {string} event - Optional event filter
     * @param {string} userId - Optional user filter
     * @returns {Promise<Array>} Webhooks
     */
    async getWebhooks(event = null, userId = null) {
        try {
            const query = { active: true }
            if (event) query.event = event
            if (userId) query.createdBy = userId

            return await Webhook.find(query).sort({ createdAt: -1 })
        } catch (error) {
            logger.error({
                type: 'webhook_get_error',
                error: error.message
            }, 'Failed to get webhooks')
            throw error
        }
    }

    /**
     * Get webhook by ID
     * @param {string} webhookId - Webhook ID
     * @returns {Promise<Object|null>} Webhook or null
     */
    async getWebhook(webhookId) {
        try {
            return await Webhook.findById(webhookId)
        } catch (error) {
            logger.error({
                type: 'webhook_get_error',
                webhookId,
                error: error.message
            }, 'Failed to get webhook')
            throw error
        }
    }

    /**
     * Update webhook
     * @param {string} webhookId - Webhook ID
     * @param {Object} updates - Updates
     */
    async updateWebhook(webhookId, updates) {
        try {
            const webhook = await Webhook.findById(webhookId)
            if (!webhook) {
                throw new Error('Webhook not found')
            }

            // Don't allow updating secret directly
            delete updates.secret

            Object.assign(webhook, updates)
            await webhook.save()

            logger.info({ webhookId, updates }, 'Webhook updated')
            return webhook
        } catch (error) {
            logger.error({
                type: 'webhook_update_error',
                webhookId,
                error: error.message
            }, 'Failed to update webhook')
            throw error
        }
    }
}

module.exports = new IntegrationService()

