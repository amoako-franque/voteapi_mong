const crypto = require('crypto')
const VoterSecretCode = require('../models/VoterSecretCode')
const VoterElectionAccess = require('../models/VoterElectionAccess')
const AuditLog = require('../models/AuditLog')
const SecurityEvent = require('../models/SecurityEvent')
const winstonLogger = require('../utils/winstonLogger')
const auditLogger = require('../utils/auditLogger')

class SecretCodeService {
    constructor() {
        this.codeLength = 6
        this.maxAttempts = 3
        this.lockoutDuration = 15 * 60 * 1000 // 15 minutes
        this.salt = process.env.CODE_SALT || 'default-salt-change-in-production'
    }

    // Generate a 6-character secret code
    generateCode() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        const numbers = '0123456789'
        let code = ''

        // Add 2 random letters
        for (let i = 0; i < 2; i++) {
            code += letters.charAt(Math.floor(Math.random() * letters.length))
        }

        // Add 4 random numbers
        for (let i = 0; i < 4; i++) {
            code += numbers.charAt(Math.floor(Math.random() * numbers.length))
        }

        return code
    }

    // Hash the secret code
    hashCode(code) {
        return crypto.createHash('sha256').update(code + this.salt).digest('hex')
    }

    // Generate salt for the code
    generateSalt() {
        return crypto.randomBytes(16).toString('hex')
    }

    // Create secret code for voter
    async createSecretCode(voterId, electionId, generatedBy, ipAddress, userAgent) {
        try {
            // Check if code already exists
            const existingCode = await VoterSecretCode.findByVoterAndElection(voterId, electionId)
            if (existingCode) {
                throw new Error('Secret code already exists for this voter and election')
            }

            // Generate new code
            const secretCode = this.generateCode()
            const salt = this.generateSalt()
            const codeHash = this.hashCode(secretCode)

            // Create secret code record
            const voterSecretCode = new VoterSecretCode({
                voterId,
                electionId,
                secretCode: secretCode,
                codeHash,
                salt,
                generatedBy,
                ipAddress,
                userAgent,
                deviceFingerprint: this.generateDeviceFingerprint(ipAddress, userAgent)
            })

            await voterSecretCode.save()

            // Log audit trail
            await this.logAuditEvent('SECRET_CODE_GENERATED', generatedBy, {
                voterId,
                electionId,
                secretCodeId: voterSecretCode._id
            }, true)

            winstonLogger.info(`Secret code generated for voter ${ voterId } in election ${ electionId }`)

            return {
                secretCode,
                voterSecretCode
            }
        } catch (error) {
            winstonLogger.logError(error, { action: 'createSecretCode', voterId, electionId, generatedBy })
            throw error
        }
    }

    // Validate secret code for voting
    async validateSecretCode(voterId, electionId, positionId, inputCode, ipAddress, userAgent) {
        try {
            // Find secret code
            const secretCode = await VoterSecretCode.findByVoterAndElection(voterId, electionId)
            if (!secretCode) {
                await this.logSecurityEvent('CODE_BRUTE_FORCE', 'HIGH', {
                    description: 'Attempted to use non-existent secret code',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress,
                    userAgent
                })
                throw new Error('Secret code not found')
            }

            // Check if code is active
            if (!secretCode.isActive) {
                await this.logSecurityEvent('CODE_BRUTE_FORCE', 'HIGH', {
                    description: 'Attempted to use deactivated secret code',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress,
                    userAgent
                })
                throw new Error('Secret code is deactivated')
            }

            // Check if code is locked
            if (secretCode.isLocked && secretCode.lockedUntil && new Date() < secretCode.lockedUntil) {
                await this.logSecurityEvent('CODE_BRUTE_FORCE', 'MEDIUM', {
                    description: 'Attempted to use locked secret code',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress,
                    userAgent
                })
                throw new Error('Secret code is temporarily locked')
            }

            // Validate code
            const isValid = secretCode.validateCode(inputCode)

            if (!isValid) {
                // Record failed attempt
                await secretCode.recordFailedAttempt()

                // Log security event
                await this.logSecurityEvent('CODE_BRUTE_FORCE', 'MEDIUM', {
                    description: 'Failed secret code attempt',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress,
                    userAgent,
                    attempts: secretCode.attempts
                })

                // Log audit trail
                await this.logAuditEvent('SECRET_CODE_FAILED', voterId, {
                    electionId,
                    positionId,
                    attempts: secretCode.attempts,
                    ipAddress,
                    userAgent
                }, false)

                throw new Error('Invalid secret code')
            }

            // Check if voter has already voted for this position
            if (secretCode.hasVotedForPosition(positionId)) {
                await this.logSecurityEvent('VOTE_MANIPULATION_ATTEMPT', 'HIGH', {
                    description: 'Attempted to vote twice for the same position',
                    voterId,
                    electionId,
                    positionId,
                    ipAddress,
                    userAgent
                })
                throw new Error('Already voted for this position')
            }

            // Reset attempts on successful validation
            await secretCode.resetAttempts()

            // Log successful validation
            await this.logAuditEvent('SECRET_CODE_USED', voterId, {
                electionId,
                positionId,
                ipAddress,
                userAgent
            }, true)

            winstonLogger.info(`Secret code validated successfully for voter ${ voterId } in election ${ electionId }`)

            return {
                isValid: true,
                secretCode
            }
        } catch (error) {
            winstonLogger.logError(error, { action: 'validateSecretCode', voterId, electionId, positionId })
            throw error
        }
    }

    // Record successful vote with secret code
    async recordVoteWithCode(secretCodeId, positionId, candidateId, voterId) {
        try {
            const secretCode = await VoterSecretCode.findById(secretCodeId)
            if (!secretCode) {
                throw new Error('Secret code not found')
            }

            // Record successful use
            await secretCode.recordSuccessfulUse(positionId, candidateId)

            // Update voter election access
            const voterAccess = await VoterElectionAccess.findByVoterAndElection(voterId, secretCode.electionId)
            if (voterAccess) {
                await voterAccess.recordVote(positionId, candidateId, null) // voteId will be set later
            }

            // Log audit trail
            await this.logAuditEvent('SECRET_CODE_USED', voterId, {
                electionId: secretCode.electionId,
                positionId,
                candidateId,
                secretCodeId
            }, true)

            winstonLogger.info(`Vote recorded with secret code ${ secretCodeId } for position ${ positionId }`)

            return secretCode
        } catch (error) {
            winstonLogger.logError(error, { action: 'recordVoteWithCode', secretCodeId, positionId, candidateId })
            throw error
        }
    }

    // Deactivate secret code
    async deactivateSecretCode(secretCodeId, deactivatedBy, reason) {
        try {
            const secretCode = await VoterSecretCode.findById(secretCodeId)
            if (!secretCode) {
                throw new Error('Secret code not found')
            }

            await secretCode.deactivateCode(deactivatedBy, reason)

            // Log audit trail
            await this.logAuditEvent('SECRET_CODE_DEACTIVATED', deactivatedBy, {
                secretCodeId,
                voterId: secretCode.voterId,
                electionId: secretCode.electionId,
                reason
            }, true)

            winstonLogger.info(`Secret code ${ secretCodeId } deactivated by ${ deactivatedBy }`)

            return secretCode
        } catch (error) {
            winstonLogger.logError(error, { action: 'deactivateSecretCode', secretCodeId, deactivatedBy })
            throw error
        }
    }

    // Reactivate secret code
    async reactivateSecretCode(secretCodeId, reactivatedBy) {
        try {
            const secretCode = await VoterSecretCode.findById(secretCodeId)
            if (!secretCode) {
                throw new Error('Secret code not found')
            }

            await secretCode.reactivateCode(reactivatedBy)

            // Log audit trail
            await this.logAuditEvent('SECRET_CODE_REACTIVATED', reactivatedBy, {
                secretCodeId,
                voterId: secretCode.voterId,
                electionId: secretCode.electionId
            }, true)

            winstonLogger.info(`Secret code ${ secretCodeId } reactivated by ${ reactivatedBy }`)

            return secretCode
        } catch (error) {
            winstonLogger.logError(error, { action: 'reactivateSecretCode', secretCodeId, reactivatedBy })
            throw error
        }
    }

    // Get secret code statistics
    async getSecretCodeStatistics(electionId) {
        try {
            const stats = await VoterSecretCode.getCodeStatistics(electionId)
            return stats[0] || {
                totalCodes: 0,
                activeCodes: 0,
                lockedCodes: 0,
                totalUses: 0,
                avgUses: 0
            }
        } catch (error) {
            winstonLogger.logError(error, { action: 'getSecretCodeStatistics', electionId })
            throw error
        }
    }

    // Find suspicious secret code activity
    async findSuspiciousActivity(electionId, timeframe = 24) {
        try {
            const since = new Date(Date.now() - timeframe * 60 * 60 * 1000)

            const suspiciousCodes = await VoterSecretCode.find({
                electionId,
                attempts: { $gte: 2 },
                lastUsedAt: { $gte: since }
            })

            return suspiciousCodes
        } catch (error) {
            winstonLogger.logError(error, { action: 'findSuspiciousActivity', electionId })
            throw error
        }
    }

    // Generate device fingerprint
    generateDeviceFingerprint(ipAddress, userAgent) {
        const components = [
            ipAddress || '',
            userAgent || '',
            new Date().getTimezoneOffset().toString()
        ]

        return crypto
            .createHash('sha256')
            .update(components.join('|'))
            .digest('hex')
    }

    // Log audit event
    async logAuditEvent(action, userId, details, success) {
        try {
            const auditLog = new AuditLog({
                userId,
                action,
                resourceType: 'SECRET_CODE',
                resourceId: details.secretCodeId,
                details,
                success,
                ipAddress: details.ipAddress || 'unknown',
                userAgent: details.userAgent || 'unknown',
                electionId: details.electionId,
                positionId: details.positionId
            })

            await auditLog.save()
        } catch (error) {
            winstonLogger.logError(error, { action: 'logAuditEvent', userId, action })
        }
    }

    // Log security event
    async logSecurityEvent(eventType, severity, eventDetails) {
        try {
            const securityEvent = new SecurityEvent({
                eventType,
                severity,
                description: eventDetails.description,
                details: eventDetails,
                userId: eventDetails.voterId,
                ipAddress: eventDetails.ipAddress || 'unknown',
                userAgent: eventDetails.userAgent || 'unknown',
                electionId: eventDetails.electionId,
                positionId: eventDetails.positionId,
                secretCodeId: eventDetails.secretCodeId
            })

            await securityEvent.save()
        } catch (error) {
            winstonLogger.logError(error, { action: 'logSecurityEvent', eventType, severity })
        }
    }

    // Send secret code via email and SMS
    async sendSecretCode(secretCode, voterEmail, voterPhone, voterName) {
        try {
            // This would integrate with email and SMS services
            // For now, we'll just log the action

            winstonLogger.info(`Secret code ${ secretCode } sent to ${ voterEmail } and ${ voterPhone } for ${ voterName }`)

            return {
                emailSent: true,
                smsSent: true,
                deliveryStatus: 'DELIVERED'
            }
        } catch (error) {
            winstonLogger.logError(error, { action: 'sendSecretCode', voterEmail, voterPhone })
            throw error
        }
    }

    // Validate code format
    validateCodeFormat(code) {
        if (!code || typeof code !== 'string') {
            return false
        }

        if (code.length !== this.codeLength) {
            return false
        }

        // Check if code contains exactly 2 letters and 4 numbers
        const letterCount = (code.match(/[A-Z]/g) || []).length
        const numberCount = (code.match(/[0-9]/g) || []).length

        return letterCount === 2 && numberCount === 4
    }

    // Get secret code usage summary
    async getSecretCodeUsageSummary(secretCodeId) {
        try {
            const secretCode = await VoterSecretCode.findById(secretCodeId)
            if (!secretCode) {
                throw new Error('Secret code not found')
            }

            return secretCode.getUsageSummary()
        } catch (error) {
            winstonLogger.logError(error, { action: 'getSecretCodeUsageSummary', secretCodeId })
            throw error
        }
    }
}

module.exports = new SecretCodeService()
