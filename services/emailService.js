const nodemailer = require('nodemailer')
const winstonLogger = require('../utils/winstonLogger')
const emailConfig = require('../config/email')
const templateService = require('./templateService')

class EmailService {
    constructor() {
        this.transporter = null
        this.initializeTransporter()
    }

    /**
     * Initialize email transporter
     */
    initializeTransporter() {
        try {
            const smtpConfig = emailConfig.getSMTPConfig()

            if (!smtpConfig || !smtpConfig.host) {
                winstonLogger.warn('SMTP not configured, email service will be disabled')
                return
            }

            this.transporter = nodemailer.createTransport({
                host: smtpConfig.host,
                port: smtpConfig.port || 587,
                secure: smtpConfig.secure || false,
                auth: smtpConfig.auth || undefined,
                tls: {
                    rejectUnauthorized: false
                }
            })

            winstonLogger.info('Email transporter initialized successfully')
        } catch (error) {
            winstonLogger.logError(error, { action: 'initializeTransporter' })
            this.transporter = null
        }
    }

    /**
     * Send email
     */
    async sendEmail(options) {
        try {
            if (!this.transporter) {
                winstonLogger.warn('Email transporter not available, skipping email send')
                return {
                    success: false,
                    message: 'Email service not configured'
                }
            }

            const defaultOptions = emailConfig.emailSettings.defaultOptions

            const mailOptions = {
                from: options.from || `${ defaultOptions.from.name } <${ defaultOptions.from.email }>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
                replyTo: options.replyTo || defaultOptions.replyTo.email,
                priority: options.priority || defaultOptions.priority,
                headers: options.headers || {}
            }

            const info = await this.transporter.sendMail(mailOptions)

            winstonLogger.info(`Email sent successfully to ${ options.to }`, {
                messageId: info.messageId,
                subject: options.subject
            })

            return {
                success: true,
                messageId: info.messageId,
                response: info.response
            }
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendEmail',
                to: options.to,
                subject: options.subject
            })

            return {
                success: false,
                error: error.message
            }
        }
    }

    /**
     * Send vote confirmation email
     */
    async sendVoteConfirmation(voter, vote, election, position, candidate) {
        try {
            const receiptHash = vote.receiptHash || vote.voteHash.substring(0, 16).toUpperCase()
            const voteDate = new Date(vote.timestamp).toLocaleString('en-US', {
                timeZone: election.timezone || 'Africa/Accra'
            })

            const html = this.getVoteConfirmationTemplate({
                voterName: voter.fullName,
                electionTitle: election.title,
                positionTitle: position.title,
                candidateName: candidate?.fullName || 'Abstention',
                receiptHash,
                voteDate
            })

            const text = `
Dear ${ voter.fullName },

Your vote has been successfully recorded for the election "${ election.title }".

Position: ${ position.title }
Candidate: ${ candidate?.fullName || 'Abstention' }
Receipt: ${ receiptHash }
Date: ${ voteDate }

Thank you for participating in the democratic process.

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to: voter.email,
                subject: `Vote Confirmed - ${ election.title }`,
                text,
                html,
                priority: 'high'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendVoteConfirmation',
                voterId: voter._id,
                voteId: vote._id
            })
            throw error
        }
    }

    /**
     * Get vote confirmation email template
     */
    getVoteConfirmationTemplate(data) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .receipt { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✓ Vote Confirmed</h1>
        </div>
        <div class="content">
            <p>Dear ${ data.voterName },</p>
            <p>Your vote has been successfully recorded for the election <strong>"${ data.electionTitle }"</strong>.</p>

            <div class="receipt">
                <p><strong>Position:</strong> ${ data.positionTitle }</p>
                <p><strong>Candidate:</strong> ${ data.candidateName }</p>
                <p><strong>Receipt:</strong> ${ data.receiptHash }</p>
                <p><strong>Date:</strong> ${ data.voteDate }</p>
            </div>

            <p>Thank you for participating in the democratic process.</p>
            <p>Best regards,<br>VoteAPI Team</p>
        </div>
        <div class="footer">
            <p>This is an automated message from VoteAPI. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `.trim()
    }

    /**
     * Send secret code email
     */
    async sendSecretCode(voter, secretCode, election) {
        try {
            const html = await this.getSecretCodeTemplate({
                voterName: voter.fullName,
                secretCode,
                electionTitle: election.title,
                voterId: voter.voterId,
                schoolName: voter.schoolId ? (await require('../models/School').findById(voter.schoolId))?.name : undefined
            })

            const text = `
Dear ${ voter.fullName },

Your secret code for the election "${ election.title }" is:

${ secretCode }

Please keep this code secure and use it to cast your vote.

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to: voter.email,
                subject: `Secret Code - ${ election.title }`,
                text,
                html,
                priority: 'high'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendSecretCode',
                voterId: voter._id,
                electionId: election._id
            })
            throw error
        }
    }

    /**
     * Get secret code email template
     * Uses Handlebars template if available, falls back to inline HTML
     */
    async getSecretCodeTemplate(data) {
        try {
            return await templateService.renderVoterCredentials({
                voterName: data.voterName,
                schoolName: data.schoolName || 'Your Institution',
                voterId: data.voterId || 'N/A',
                secretCode: data.secretCode,
                votingUrl: data.votingUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
            })
        } catch (error) {
            // Fallback to inline template if template service fails
            winstonLogger.warn('Failed to render template, using fallback', { error: error.message })
            return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .code { background-color: white; padding: 20px; margin: 15px 0; text-align: center; border: 2px dashed #2196F3; }
        .code-value { font-size: 32px; font-weight: bold; color: #2196F3; letter-spacing: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .warning { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your Secret Code</h1>
        </div>
        <div class="content">
            <p>Dear ${ data.voterName },</p>
            <p>Your secret code for the election <strong>"${ data.electionTitle }"</strong> is:</p>

            <div class="code">
                <div class="code-value">${ data.secretCode }</div>
            </div>

            <div class="warning">
                <strong>⚠️ Important:</strong> Keep this code secure and do not share it with anyone.
                You will need this code to cast your vote.
            </div>

            <p>Best regards,<br>VoteAPI Team</p>
        </div>
        <div class="footer">
            <p>This is an automated message from VoteAPI. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
            `.trim()
        }
    }

    /**
     * Send poll results to creator
     */
    async sendPollResultsToCreator({ to, pollTitle, pollSubject, results, pollId }) {
        try {
            const html = this.getPollResultsCreatorTemplate({
                pollTitle,
                pollSubject,
                results,
                pollId
            })

            const text = `
Dear Poll Creator,

Your poll "${ pollTitle }" has ended. Here are the results:

Subject: ${ pollSubject }
Total Votes: ${ results.totalVotes }
Average Rating: ${ results.averageRating.toFixed(2) }
Registered Votes: ${ results.registeredVotes }
Anonymous Votes: ${ results.anonymousVotes }

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: `Poll Results - ${ pollTitle }`,
                text,
                html,
                priority: 'normal'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendPollResultsToCreator',
                to,
                pollId
            })
            throw error
        }
    }

    /**
     * Get poll results email template for creator
     */
    getPollResultsCreatorTemplate({ pollTitle, pollSubject, results, pollId }) {
        const resultsUrl = `${ process.env.FRONTEND_URL || 'http://localhost:3000' }/polls/${ pollId }/results`
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #9C27B0; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .stats { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .stat-item { margin: 10px 0; }
        .stat-label { font-weight: bold; }
        .button { display: inline-block; background-color: #9C27B0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Poll Results</h1>
        </div>
        <div class="content">
            <p>Dear Poll Creator,</p>
            <p>Your poll <strong>"${ pollTitle }"</strong> has ended. Here are the results:</p>

            <div class="stats">
                <h3>Poll Statistics</h3>
                <div class="stat-item">
                    <span class="stat-label">Subject:</span>
                    <span>${ pollSubject }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Votes:</span>
                    <span>${ results.totalVotes }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Average Rating:</span>
                    <span>${ results.averageRating.toFixed(2) }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Registered Votes:</span>
                    <span>${ results.registeredVotes }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Anonymous Votes:</span>
                    <span>${ results.anonymousVotes }</span>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${ resultsUrl }" class="button">View Full Results</a>
            </div>

            <p>Thank you for using VoteAPI!</p>
        </div>
        <div class="footer">
            <p>This is an automated message from VoteAPI. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `.trim()
    }

    /**
     * Send poll results to voter
     */
    async sendPollResultsToVoter({ to, voterName, pollTitle, pollSubject, results, pollId }) {
        try {
            const html = this.getPollResultsVoterTemplate({
                voterName,
                pollTitle,
                pollSubject,
                results,
                pollId
            })

            const text = `
Dear ${ voterName || 'Voter' },

The poll "${ pollTitle }" you participated in has ended. Here are the results:

Subject: ${ pollSubject }
Total Votes: ${ results.totalVotes }
Average Rating: ${ results.averageRating.toFixed(2) }

Thank you for participating!

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: `Poll Results - ${ pollTitle }`,
                text,
                html,
                priority: 'normal'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendPollResultsToVoter',
                to,
                pollId
            })
            throw error
        }
    }

    /**
     * Get poll results email template for voter
     */
    getPollResultsVoterTemplate({ voterName, pollTitle, pollSubject, results, pollId }) {
        const resultsUrl = `${ process.env.FRONTEND_URL || 'http://localhost:3000' }/polls/${ pollId }/results`
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #9C27B0; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
        .stats { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .stat-item { margin: 10px 0; }
        .stat-label { font-weight: bold; }
        .stat-value { color: #9C27B0; }
        .button { display: inline-block; background-color: #9C27B0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Poll Results</h1>
        </div>
        <div class="content">
            <p>Dear ${ voterName || 'Voter' },</p>
            <p>The poll <strong>"${ pollTitle }"</strong> you participated in has ended. Here are the results:</p>

            <div class="stats">
                <h3>Poll Statistics</h3>
                <div class="stat-item">
                    <span class="stat-label">Subject:</span>
                    <span class="stat-value">${ pollSubject }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Votes:</span>
                    <span class="stat-value">${ results.totalVotes }</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Average Rating:</span>
                    <span class="stat-value">${ results.averageRating.toFixed(2) }</span>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${ resultsUrl }" class="button">View Full Results</a>
            </div>

            <p>Thank you for participating!</p>
        </div>
        <div class="footer">
            <p>This is an automated message from VoteAPI. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `.trim()
    }

    /**
     * Send password reset email
     */
    async sendPasswordReset({ to, userName, resetUrl, expiresIn = '1 hour' }) {
        try {
            const html = await templateService.renderPasswordReset({
                userName,
                resetUrl,
                expiresIn
            })

            const text = `
Hi ${ userName },

We received a request to reset your password. Click the link below to create a new password:

${ resetUrl }

This link will expire in ${ expiresIn }.

If you didn't request this password reset, you can safely ignore this email.

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: 'Password Reset Request - VoteAPI',
                text,
                html,
                priority: 'high'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendPasswordReset',
                to
            })
            throw error
        }
    }

    /**
     * Send election results email
     */
    async sendElectionResults({ to, election, results, isFinal = false }) {
        try {
            const html = await templateService.renderElectionResults({
                election,
                results,
                isFinal
            })

            const text = `
Election Results: ${ election.title }

${ results.map(r => `${ r.position.title }:\n${ r.candidates.map(c => `  ${ c.name }: ${ c.vote_count } votes`).join('\n') }`).join('\n\n') }

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: `Election Results - ${ election.title }`,
                text,
                html,
                priority: 'normal'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendElectionResults',
                to,
                electionId: election._id
            })
            throw error
        }
    }

    /**
     * Send election period notification
     */
    async sendElectionPeriodNotification({ to, election }) {
        try {
            const html = await templateService.renderElectionPeriod({
                election,
                startDateTime: election.startDateTime,
                endDateTime: election.endDateTime,
                timezone: election.timezone || 'Africa/Accra'
            })

            const text = `
${ election.title } - Voting Period

Voting opens on ${ election.startDateTime } and closes on ${ election.endDateTime } (${ election.timezone }).

Please make sure to cast your vote within this time window.

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: `Voting Period - ${ election.title }`,
                text,
                html,
                priority: 'normal'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendElectionPeriodNotification',
                to,
                electionId: election._id
            })
            throw error
        }
    }

    /**
     * Send voter notification
     */
    async sendVoterNotification({ to, voter, school, positions = [] }) {
        try {
            const html = await templateService.renderVoterNotification({
                voter,
                school,
                positions
            })

            const text = `
Hello ${ voter.first_name } ${ voter.last_name },

You are eligible to vote in the upcoming election at ${ school.name }.

Candidates:
${ positions.map(p => `${ p.title }:\n${ p.candidates.map(c => `  - ${ c.name }${ c.campaign_slogan ? ` - "${ c.campaign_slogan }"` : '' }`).join('\n') }`).join('\n\n') }

Your Voter ID Number: ${ voter.voter_id_number }

Best regards,
VoteAPI Team
            `.trim()

            return await this.sendEmail({
                to,
                subject: `Election Notification - ${ school.name }`,
                text,
                html,
                priority: 'normal'
            })
        } catch (error) {
            winstonLogger.logError(error, {
                action: 'sendVoterNotification',
                to,
                voterId: voter._id
            })
            throw error
        }
    }

    /**
     * Verify email transporter connection
     */
    async verifyConnection() {
        try {
            if (!this.transporter) {
                return { success: false, message: 'Email transporter not initialized' }
            }

            await this.transporter.verify()
            return { success: true, message: 'Email transporter verified' }
        } catch (error) {
            winstonLogger.logError(error, { action: 'verifyConnection' })
            return { success: false, error: error.message }
        }
    }
}

module.exports = new EmailService()
