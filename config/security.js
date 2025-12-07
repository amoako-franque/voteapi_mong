const crypto = require('crypto')

const securityConfig = {
    // Secret Code Configuration
    secretCode: {
        length: 6,
        characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        maxAttempts: 3,
        lockoutDuration: 15 * 60 * 1000,
        hashAlgorithm: 'sha256',
        saltRounds: 12
    },

    // Encryption Configuration
    encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32, // 256 bits
        ivLength: 16,  // 128 bits
        tagLength: 16, // 128 bits
        keyDerivation: {
            algorithm: 'pbkdf2',
            iterations: 100000,
            saltLength: 32
        }
    },

    // Digital Signature Configuration
    signature: {
        algorithm: 'ecdsa',
        curve: 'secp256k1',
        hashAlgorithm: 'sha256',
        encoding: 'hex'
    },

    // Hash Chain Configuration
    hashChain: {
        algorithm: 'sha256',
        encoding: 'hex',
        blockSize: 1024,
        merkleTreeDepth: 10
    },

    // Zero-Knowledge Proof Configuration
    zkProof: {
        curve: 'bn254',
        hashFunction: 'poseidon',
        proofSize: 128,
        verificationKeySize: 256
    },

    // Session Configuration
    session: {
        timeout: 30 * 60 * 1000,
        maxSessions: 5,
        cleanupInterval: 5 * 60 * 1000,
        secure: true,
        httpOnly: true,
        sameSite: 'strict'
    },

    // Rate Limiting Configuration
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: (req) => {
            return `${ req.ip }-${ req.user?.id || 'anonymous' }`
        }
    },

    // Device Fingerprinting Configuration
    deviceFingerprint: {
        includeUserAgent: true,
        includeScreenResolution: true,
        includeTimezone: true,
        includeLanguage: true,
        includePlatform: true,
        includeCookies: false,
        hashAlgorithm: 'sha256'
    },

    // Security Headers Configuration
    securityHeaders: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    },

    // Audit Logging Configuration
    auditLog: {
        logLevel: 'info',
        includeRequestBody: true,
        includeResponseBody: false,
        includeHeaders: true,
        includeUserAgent: true,
        includeIP: true,
        maxBodySize: 1024,
        sensitiveFields: ['password', 'secretCode', 'token', 'key', 'secret']
    },

    // Security Event Configuration
    securityEvent: {
        severityLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        eventTypes: [
            'SECRET_CODE_VALIDATION_FAILED',
            'SECRET_CODE_VALIDATION_SUCCESS',
            'SECRET_CODE_GENERATION',
            'SECRET_CODE_DEACTIVATION',
            'VOTE_CAST_SUCCESS',
            'VOTE_CAST_FAILED',
            'VOTE_INTEGRITY_CHECK',
            'VOTE_CHAIN_VERIFICATION',
            'SUSPICIOUS_ACTIVITY',
            'RATE_LIMIT_EXCEEDED',
            'SESSION_EXPIRED',
            'DEVICE_FINGERPRINT_MISMATCH',
            'UNAUTHORIZED_ACCESS',
            'ADMIN_ACTION',
            'DATA_ACCESS',
            'DATA_MODIFICATION',
            'CONFIGURATION_CHANGE',
            'SECURITY_EVENT'
        ],
        retentionDays: 90,
        alertThresholds: {
            HIGH: 5,
            CRITICAL: 1
        }
    },

    // Vote Chain Configuration
    voteChain: {
        blockSize: 100,
        merkleTreeDepth: 10,
        hashAlgorithm: 'sha256',
        encoding: 'hex',
        verificationInterval: 24 * 60 * 60 * 1000,
        integrityCheckInterval: 60 * 60 * 1000
    },

    // Blockchain Integration Configuration
    blockchain: {
        enabled: false,
        network: 'testnet',
        contractAddress: null,
        gasLimit: 1000000,
        gasPrice: '20000000000',
        confirmationBlocks: 3
    },

    // Machine Learning Configuration
    mlDetection: {
        enabled: false,
        modelPath: './models/fraud_detection_model.json',
        confidenceThreshold: 0.8,
        features: [
            'voting_time',
            'device_fingerprint',
            'ip_address',
            'user_agent',
            'voting_pattern',
            'session_duration',
            'failed_attempts',
            'geographic_location'
        ],
        retrainInterval: 7 * 24 * 60 * 60 * 1000
    },

    // Notification Configuration
    notification: {
        email: {
            enabled: true,
            provider: 'smtp',
            smtp: {
                host: process.env.SMTP_HOST || 'localhost',
                port: process.env.SMTP_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            },
            templates: {
                secretCode: 'secret-code-template',
                voteConfirmation: 'vote-confirmation-template',
                securityAlert: 'security-alert-template'
            }
        },
        sms: {
            enabled: true,
            provider: 'twilio',
            twilio: {
                accountSid: process.env.TWILIO_ACCOUNT_SID,
                authToken: process.env.TWILIO_AUTH_TOKEN,
                fromNumber: process.env.TWILIO_FROM_NUMBER
            }
        },
        push: {
            enabled: false,
            provider: 'fcm',
            fcm: {
                serverKey: process.env.FCM_SERVER_KEY,
                projectId: process.env.FCM_PROJECT_ID
            }
        }
    },

    // Database Security Configuration
    database: {
        encryption: {
            enabled: true,
            algorithm: 'aes-256-gcm',
            keyRotationInterval: 30 * 24 * 60 * 60 * 1000,
            backupEncryption: true
        },
        accessLogging: {
            enabled: true,
            logLevel: 'info',
            includeQuery: false,
            includeResults: false,
            sensitiveCollections: ['users', 'votes', 'secretcodes']
        },
        connectionSecurity: {
            ssl: true,
            sslValidate: true,
            sslCA: process.env.MONGODB_SSL_CA,
            sslCert: process.env.MONGODB_SSL_CERT,
            sslKey: process.env.MONGODB_SSL_KEY
        }
    },

    // Network Security Configuration
    network: {
        https: {
            enabled: true,
            port: process.env.HTTPS_PORT || 443,
            sslCert: process.env.SSL_CERT_PATH,
            sslKey: process.env.SSL_KEY_PATH,
            sslCA: process.env.SSL_CA_PATH
        },
        firewall: {
            enabled: false,
            rules: [
                {
                    action: 'block',
                    source: '0.0.0.0/0',
                    destination: 'any',
                    port: 'any',
                    protocol: 'any',
                    condition: 'rate_limit_exceeded'
                }
            ]
        },
        ddosProtection: {
            enabled: false,
            threshold: 1000,
            windowMs: 60 * 1000,
            blockDuration: 15 * 60 * 1000
        }
    },

    // Compliance Configuration
    compliance: {
        gdpr: {
            enabled: true,
            dataRetentionDays: 365,
            rightToErasure: true,
            dataPortability: true,
            consentManagement: true
        },
        electionLaws: {
            enabled: true,
            jurisdiction: 'US',
            auditTrailRetention: 7 * 365 * 24 * 60 * 60 * 1000,
            voterPrivacy: true,
            transparencyRequirements: true
        }
    },

    // Development Configuration
    development: {
        debugMode: process.env.NODE_ENV === 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
        enableTestRoutes: process.env.NODE_ENV === 'development',
        mockServices: process.env.NODE_ENV === 'development',
        skipSecurityChecks: false
    }
}

// Helper functions
const generateRandomString = (length, characters = securityConfig.secretCode.characters) => {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

const generateSecureRandomBytes = (length) => {
    return crypto.randomBytes(length)
}

const generateSecureRandomString = (length) => {
    return generateRandomString(length, securityConfig.secretCode.characters)
}

const hashData = (data, algorithm = securityConfig.secretCode.hashAlgorithm) => {
    return crypto.createHash(algorithm).update(data).digest('hex')
}

const generateSalt = (length = 32) => {
    return crypto.randomBytes(length).toString('hex')
}

const deriveKey = (password, salt, iterations = securityConfig.encryption.keyDerivation.iterations) => {
    return crypto.pbkdf2Sync(password, salt, iterations, securityConfig.encryption.keyLength, 'sha256')
}

const encryptData = (data, key, iv = null) => {
    if (!iv) {
        iv = crypto.randomBytes(securityConfig.encryption.ivLength)
    }

    const cipher = crypto.createCipher(securityConfig.encryption.algorithm, key)
    cipher.setAAD(Buffer.from('voteapi', 'utf8'))

    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const tag = cipher.getAuthTag()

    return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    }
}

const decryptData = (encryptedData, key, iv, tag) => {
    const decipher = crypto.createDecipher(securityConfig.encryption.algorithm, key)
    decipher.setAAD(Buffer.from('voteapi', 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

const generateKeyPair = () => {
    return crypto.generateKeyPairSync(securityConfig.signature.algorithm, {
        namedCurve: securityConfig.signature.curve,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    })
}

const signData = (data, privateKey) => {
    const sign = crypto.createSign(securityConfig.signature.hashAlgorithm)
    sign.update(data)
    return sign.sign(privateKey, securityConfig.signature.encoding)
}

const verifySignature = (data, signature, publicKey) => {
    const verify = crypto.createVerify(securityConfig.signature.hashAlgorithm)
    verify.update(data)
    return verify.verify(publicKey, signature, securityConfig.signature.encoding)
}

const generateDeviceFingerprint = (req) => {
    const components = []

    if (securityConfig.deviceFingerprint.includeUserAgent) {
        components.push(req.headers['user-agent'] || '')
    }

    if (securityConfig.deviceFingerprint.includeScreenResolution) {
        components.push(req.headers['x-screen-resolution'] || '')
    }

    if (securityConfig.deviceFingerprint.includeTimezone) {
        components.push(req.headers['x-timezone'] || '')
    }

    if (securityConfig.deviceFingerprint.includeLanguage) {
        components.push(req.headers['accept-language'] || '')
    }

    if (securityConfig.deviceFingerprint.includePlatform) {
        components.push(req.headers['x-platform'] || '')
    }

    const fingerprint = components.join('|')
    return hashData(fingerprint, securityConfig.deviceFingerprint.hashAlgorithm)
}

const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input.replace(/[<>\"'&]/g, (match) => {
            const escapeMap = {
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '&': '&amp;'
            }
            return escapeMap[match]
        })
    }

    if (typeof input === 'object' && input !== null) {
        const sanitized = {}
        for (const [key, value] of Object.entries(input)) {
            if (securityConfig.auditLog.sensitiveFields.includes(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]'
            } else {
                sanitized[key] = sanitizeInput(value)
            }
        }
        return sanitized
    }

    return input
}

const getSecurityHeaders = () => {
    return { ...securityConfig.securityHeaders }
}

const isDevelopmentMode = () => {
    return securityConfig.development.debugMode
}

const isTestMode = () => {
    return securityConfig.development.enableTestRoutes
}

const shouldSkipSecurityChecks = () => {
    return securityConfig.development.skipSecurityChecks
}

module.exports = {
    ...securityConfig,
    generateRandomString,
    generateSecureRandomBytes,
    generateSecureRandomString,
    hashData,
    generateSalt,
    deriveKey,
    encryptData,
    decryptData,
    generateKeyPair,
    signData,
    verifySignature,
    generateDeviceFingerprint,
    sanitizeInput,
    getSecurityHeaders,
    isDevelopmentMode,
    isTestMode,
    shouldSkipSecurityChecks
}
