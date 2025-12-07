const emailConfig = {
    /**
     * Get SMTP configuration
     */
    getSMTPConfig() {
        return {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        }
    },

    /**
     * Get default sender email
     */
    getDefaultSender() {
        return {
            name: process.env.EMAIL_SENDER_NAME || 'VoteAPI',
            email: process.env.EMAIL_SENDER_EMAIL || 'noreply@voteapi.com'
        }
    },

    /**
     * Get email templates directory
     */
    getTemplatesDir() {
        return process.env.EMAIL_TEMPLATES_DIR || './templates/emails'
    },

    /**
     * Email configuration object
     */
    emailSettings: {
        priorities: {
            HIGH: 'high',
            NORMAL: 'normal',
            LOW: 'low'
        },

        categories: {
            SYSTEM: 'system',
            NOTIFICATION: 'notification',
            MARKETING: 'marketing',
            TRANSACTIONAL: 'transactional'
        },
        defaultOptions: {
            from: {
                name: 'VoteAPI',
                email: 'noreply@voteapi.com'
            },
            replyTo: {
                name: 'VoteAPI Support',
                email: 'support@voteapi.com'
            },
            priority: 'normal',
            category: 'notification'
        },

        rateLimit: {
            maxEmailsPerHour: 100,
            maxEmailsPerDay: 1000
        },

        retry: {
            maxAttempts: 3,
            delayBetweenAttempts: 60000
        },

        queue: {
            enabled: true,
            concurrency: 5,
            removeOnSuccess: true,
            removeOnFail: false
        }
    },

    /**
     * Get email verification configuration
     */
    getVerificationConfig() {
        return {
            enabled: process.env.EMAIL_VERIFICATION_ENABLED === 'true',
            expirationHours: parseInt(process.env.EMAIL_VERIFICATION_EXPIRATION_HOURS) || 24,
            resendCooldownMinutes: parseInt(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN) || 5
        }
    },

    /**
     * Get email templates configuration
     */
    getTemplatesConfig() {
        return {
            directory: this.getTemplatesDir(),
            engine: 'handlebars',
            extension: '.hbs',
            defaultLayout: 'layout',
            partialsDir: './templates/emails/partials',
            layoutsDir: './templates/emails/layouts'
        }
    },

    /**
     * Validate email configuration
     */
    validateConfig() {
        const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']
        const missing = required.filter(key => !process.env[key])

        if (missing.length > 0) {
            throw new Error(`Missing required email configuration: ${ missing.join(', ') }`)
        }

        return true
    },

    /**
     * Get email logging configuration
     */
    getLoggingConfig() {
        return {
            enabled: process.env.EMAIL_LOGGING_ENABLED !== 'false',
            logLevel: process.env.EMAIL_LOG_LEVEL || 'info',
            logSuccess: process.env.EMAIL_LOG_SUCCESS === 'true',
            logFailure: process.env.EMAIL_LOG_FAILURE !== 'false'
        }
    }
}

module.exports = emailConfig

