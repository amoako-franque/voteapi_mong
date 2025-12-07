const logger = require('../utils/logger')

/**
 * Push Notification Service
 * Supports Firebase Cloud Messaging (FCM) and OneSignal
 */
class PushNotificationService {
    constructor() {
        this.provider = process.env.PUSH_NOTIFICATION_PROVIDER || 'FIREBASE'
        this.fcmInitialized = false
        this.oneSignalInitialized = false
    }

    /**
     * Initialize push notification service
     */
    async initialize() {
        try {
            if (this.provider === 'FIREBASE' && process.env.FIREBASE_SERVER_KEY) {
                this.fcmInitialized = true
                logger.info('Firebase Cloud Messaging initialized')
                return { initialized: true, provider: 'FIREBASE' }
            } else if (this.provider === 'ONESIGNAL' && process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY) {
                this.oneSignalInitialized = true
                logger.info('OneSignal initialized')
                return { initialized: true, provider: 'ONESIGNAL' }
            } else {
                logger.warn('Push notification service not configured')
                return { initialized: false, provider: null }
            }
        } catch (error) {
            logger.error({
                type: 'push_notification_init_error',
                error: error.message
            }, 'Failed to initialize push notification service')
            return { initialized: false, provider: null }
        }
    }

    /**
     * Send push notification via Firebase
     */
    async sendFirebaseNotification(deviceToken, notification) {
        try {
            if (!this.fcmInitialized) {
                throw new Error('Firebase not initialized')
            }

            const axios = require('axios')
            const serverKey = process.env.FIREBASE_SERVER_KEY

            const payload = {
                to: deviceToken,
                notification: {
                    title: notification.title,
                    body: notification.body,
                    icon: notification.icon || '/icon.png',
                    sound: notification.sound || 'default'
                },
                data: notification.data || {}
            }

            const response = await axios.post(
                'https://fcm.googleapis.com/fcm/send',
                payload,
                {
                    headers: {
                        'Authorization': `key=${serverKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            return {
                success: response.data.success === 1,
                messageId: response.data.message_id
            }
        } catch (error) {
            logger.error({
                type: 'firebase_push_error',
                error: error.message
            }, 'Failed to send Firebase push notification')
            throw error
        }
    }

    /**
     * Send push notification via OneSignal
     */
    async sendOneSignalNotification(deviceToken, notification) {
        try {
            if (!this.oneSignalInitialized) {
                throw new Error('OneSignal not initialized')
            }

            const axios = require('axios')
            const appId = process.env.ONESIGNAL_APP_ID
            const restApiKey = process.env.ONESIGNAL_REST_API_KEY

            const payload = {
                app_id: appId,
                include_player_ids: [deviceToken],
                headings: { en: notification.title },
                contents: { en: notification.body },
                data: notification.data || {}
            }

            const response = await axios.post(
                'https://onesignal.com/api/v1/notifications',
                payload,
                {
                    headers: {
                        'Authorization': `Basic ${restApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            return {
                success: true,
                notificationId: response.data.id
            }
        } catch (error) {
            logger.error({
                type: 'onesignal_push_error',
                error: error.message
            }, 'Failed to send OneSignal push notification')
            throw error
        }
    }

    /**
     * Send push notification (auto-detect provider)
     */
    async sendPushNotification(deviceToken, notification) {
        try {
            if (this.provider === 'FIREBASE' && this.fcmInitialized) {
                return await this.sendFirebaseNotification(deviceToken, notification)
            } else if (this.provider === 'ONESIGNAL' && this.oneSignalInitialized) {
                return await this.sendOneSignalNotification(deviceToken, notification)
            } else {
                logger.warn('Push notification service not configured')
                return { success: false, message: 'Push notification service not configured' }
            }
        } catch (error) {
            logger.error({
                type: 'push_notification_error',
                error: error.message
            }, 'Failed to send push notification')
            throw error
        }
    }

    /**
     * Send push notification to multiple devices
     */
    async sendBulkPushNotification(deviceTokens, notification) {
        try {
            const results = {
                total: deviceTokens.length,
                successful: 0,
                failed: 0,
                errors: []
            }

            for (const token of deviceTokens) {
                try {
                    await this.sendPushNotification(token, notification)
                    results.successful++
                } catch (error) {
                    results.failed++
                    results.errors.push({
                        token,
                        error: error.message
                    })
                }
            }

            return results
        } catch (error) {
            logger.error({
                type: 'bulk_push_notification_error',
                error: error.message
            }, 'Failed to send bulk push notifications')
            throw error
        }
    }
}

module.exports = new PushNotificationService()

