const Notification = require('../models/Notification')
const emailService = require('./emailService')
const winstonLogger = require('../utils/winstonLogger')
const VoterRegistry = require('../models/VoterRegistry')
const twilio = require('twilio')
const pushNotificationService = require('./pushNotificationService')

class NotificationService {
    /**
     * Create and send notification
     */
    async createNotification(notificationData) {
        try {
            const notification = new Notification({
                ...notificationData,
                status: 'PENDING'
            })

            await notification.save()

            // Send notification based on channel
            if (notification.channel === 'EMAIL') {
                await this.sendEmailNotification(notification)
            } else if (notification.channel === 'SMS') {
                await this.sendSMSNotification(notification)
            } else if (notification.channel === 'PUSH') {
                await this.sendPushNotification(notification)
            } else if (notification.channel === 'IN_APP') {
                // Send real-time notification via Socket.io
                await this.sendInAppNotification(notification)
                notification.status = 'SENT'
                notification.sentAt = new Date()
                await notification.save()
            }

            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'createNotification',
                notificationData
            })
            throw error
        }
    }

    /**
     * Send email notification
     */
    async sendEmailNotification(notification) {
        try {
            let recipientEmail = null

            if (notification.recipientId) {
                const recipient = await VoterRegistry.findById(notification.recipientId)
                if (recipient && recipient.email) {
                    recipientEmail = recipient.email
                }
            }

            if (!recipientEmail) {
                notification.status = 'FAILED'
                await notification.save()
                throw new Error('Recipient email not found')
            }

            const emailResult = await emailService.sendEmail({
                to: recipientEmail,
                subject: notification.title,
                text: notification.message,
                html: this.formatMessageAsHTML(notification.message)
            })

            if (emailResult.success) {
                notification.status = 'SENT'
                notification.sentAt = new Date()
            } else {
                notification.status = 'FAILED'
            }

            await notification.save()
            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendEmailNotification',
                notificationId: notification._id
            })

            notification.status = 'FAILED'
            await notification.save()
            throw error
        }
    }

    /**
     * Send SMS notification via Twilio
     */
    async sendSMSNotification(notification) {
        try {
            // Check if SMS is enabled
            if (process.env.SMS_ENABLED !== 'true') {
                winstonLogger.info('SMS notifications are disabled')
                notification.status = 'CANCELLED'
                await notification.save()
                return notification
            }

            // Get recipient phone number
            let recipientPhone = null

            if (notification.recipientId) {
                const recipient = await VoterRegistry.findById(notification.recipientId)
                if (recipient && recipient.phone) {
                    recipientPhone = recipient.phone
                }
            }

            if (!recipientPhone) {
                notification.status = 'FAILED'
                await notification.save()
                throw new Error('Recipient phone number not found')
            }

            // Initialize Twilio client
            const accountSid = process.env.TWILIO_ACCOUNT_SID
            const authToken = process.env.TWILIO_AUTH_TOKEN
            const fromNumber = process.env.TWILIO_FROM_NUMBER

            if (!accountSid || !authToken || !fromNumber) {
                throw new Error('Twilio configuration is incomplete')
            }

            const client = twilio(accountSid, authToken)

            // Send SMS
            const message = await client.messages.create({
                body: notification.message,
                from: fromNumber,
                to: recipientPhone
            })

            if (message.sid) {
                notification.status = 'SENT'
                notification.sentAt = new Date()
                notification.metadata = {
                    ...notification.metadata,
                    twilioMessageSid: message.sid,
                    twilioStatus: message.status
                }
                winstonLogger.info({
                    action: 'sendSMSNotification',
                    notificationId: notification._id,
                    messageSid: message.sid,
                    phone: recipientPhone
                }, 'SMS notification sent successfully')
            } else {
                notification.status = 'FAILED'
            }

            await notification.save()
            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendSMSNotification',
                notificationId: notification._id
            })

            notification.status = 'FAILED'
            notification.metadata = {
                ...notification.metadata,
                error: error.message
            }
            await notification.save()
            throw error
        }
    }

    /**
     * Send vote confirmation notification
     */
    async sendVoteConfirmation(voter, vote, election, position, candidate) {
        try {
            const notification = await this.createNotification({
                type: 'VOTE_CONFIRMATION',
                title: `Vote Confirmed - ${ election.title }`,
                message: `Your vote for ${ position.title } has been successfully recorded. Receipt: ${ vote.receiptHash || vote.voteHash.substring(0, 16).toUpperCase() }`,
                recipientId: voter._id,
                electionId: election._id,
                channel: 'EMAIL',
                metadata: {
                    voteId: vote._id,
                    positionId: position._id,
                    candidateId: candidate?._id,
                    receiptHash: vote.receiptHash || vote.voteHash.substring(0, 16).toUpperCase()
                }
            })

            // Also send email directly
            if (notification.channel === 'EMAIL') {
                await emailService.sendVoteConfirmation(voter, vote, election, position, candidate)
            }

            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendVoteConfirmation',
                voterId: voter._id,
                voteId: vote._id
            })
            // Don't throw - notification failure shouldn't block vote submission
        }
    }

    /**
     * Get notifications for a recipient
     */
    async getNotifications(recipientId, options = {}) {
        try {
            const {
                electionId,
                type,
                status,
                channel,
                page = 1,
                limit = 50
            } = options

            const query = { recipientId }

            if (electionId) query.electionId = electionId
            if (type) query.type = type
            if (status) query.status = status
            if (channel) query.channel = channel

            const skip = (page - 1) * limit

            const [notifications, total] = await Promise.all([
                Notification.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Notification.countDocuments(query)
            ])

            return {
                notifications,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'getNotifications',
                recipientId
            })
            throw error
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId, recipientId) {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                recipientId
            })

            if (!notification) {
                throw new Error('Notification not found')
            }

            notification.readAt = new Date()
            await notification.save()

            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'markAsRead',
                notificationId,
                recipientId
            })
            throw error
        }
    }

    /**
     * Send provisional results to candidate
     */
    async sendProvisionalResults({ candidate, election, voteCount, totalVotes, percentage, position }) {
        try {
            const voter = candidate.voterId
            if (!voter || !voter.email) {
                throw new Error('Candidate email not found')
            }

            const subject = `Provisional Results - ${ election.title }`
            const message = `
Dear ${ candidate.fullName },

This is to inform you of the provisional results for the position of ${ position?.title || 'N/A' } in the election "${ election.title }".

Your Results:
- Total Votes Received: ${ voteCount }
- Total Votes Cast: ${ totalVotes }
- Percentage: ${ percentage }%

IMPORTANT: These are PROVISIONAL results. If you wish to contest these results, please reply to this email within 48 hours with your concerns.

The final results will be announced after the contest period ends.

Best regards,
Election Management System
            `.trim()

            // Send email using emailService
            await emailService.sendEmail({
                to: voter.email,
                subject: subject,
                text: message,
                html: this.formatMessageAsHTML(message)
            })

            // Create notification record
            await Notification.create({
                type: 'PROVISIONAL_RESULTS',
                title: subject,
                message: `Provisional results sent: ${ voteCount } votes (${ percentage }%)`,
                recipientId: voter._id,
                electionId: election._id,
                channel: 'EMAIL',
                status: 'SENT',
                sentAt: new Date(),
                metadata: {
                    voteCount,
                    totalVotes,
                    percentage,
                    positionId: position?._id
                }
            })

            winstonLogger.logInfo({
                action: 'sendProvisionalResults',
                candidateId: candidate._id,
                electionId: election._id,
                email: voter.email
            }, 'Provisional results sent to candidate')
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendProvisionalResults',
                candidateId: candidate._id,
                electionId: election._id
            })
            throw error
        }
    }

    /**
     * Send in-app notification via Socket.io
     */
    async sendInAppNotification(notification) {
        try {
            // Get Socket.io instance from app
            const app = require('../app')
            const io = app.get('io')

            if (!io) {
                winstonLogger.warn('Socket.io not initialized, cannot send in-app notification')
                return
            }

            if (!notification.recipientId) {
                winstonLogger.warn('No recipient ID for in-app notification')
                return
            }

            // Emit to user's notification room
            const notificationRoom = `notifications:${notification.recipientId}`
            io.to(notificationRoom).emit('notification:new', {
                id: notification._id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                createdAt: notification.createdAt,
                metadata: notification.metadata
            })

            winstonLogger.info({
                action: 'sendInAppNotification',
                notificationId: notification._id,
                recipientId: notification.recipientId
            }, 'In-app notification sent via Socket.io')
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendInAppNotification',
                notificationId: notification._id
            })
            // Don't throw - notification failure shouldn't break the flow
        }
    }

    /**
     * Mark notification as read and notify client
     */
    async markAsReadAndNotify(notificationId, recipientId) {
        try {
            const notification = await this.markAsRead(notificationId, recipientId)

            // Notify client via Socket.io
            const app = require('../app')
            const io = app.get('io')
            if (io) {
                const notificationRoom = `notifications:${recipientId}`
                io.to(notificationRoom).emit('notification:read', {
                    id: notification._id,
                    readAt: notification.readAt
                })
            }

            return notification
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'markAsReadAndNotify',
                notificationId,
                recipientId
            })
            throw error
        }
    }

    /**
     * Format plain text message as HTML
     */
    formatMessageAsHTML(message) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    </style>
</head>
<body>
    <div class="container">
        ${ message.replace(/\n/g, '<br>') }
    </div>
</body>
</html>
        `.trim()
    }
}

module.exports = new NotificationService()

