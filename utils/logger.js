const pino = require("pino")
const path = require("path")
const pkg = require(path.join(__dirname, "../package.json"))
const sanitizeHtml = require("sanitize-html")

const isProduction = process.env.NODE_ENV === "production"


const sanitizeOptions = {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    allowedSchemes: [],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: [],
    allowProtocolRelative: false,
    enforceHtmlBoundary: false
}


const logger = pino({
    name: pkg.name || "voteapi",
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    base: {
        app: pkg.name || "voteapi",
        version: pkg.version || "1.0.0",
        env: process.env.NODE_ENV || "development",
        pid: process.pid,
        hostname: require('os').hostname(),
    },
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['x-api-key']",
            "req.body.password",
            "req.body.currentPassword",
            "req.body.newPassword",
            "req.body.token",
            "req.body.refreshToken",
            "password",
            "newPassword",
            "currentPassword",
            "token",
            "jwt",
            "refreshToken",
            "apiKey",
            "secret",
            "privateKey",
            "accessToken",
            "authToken",
            "sessionId",
            "sessionToken"
        ],
        remove: true,
    },
    serializers: {
        req: (req) => {
            return {
                method: req.method,
                url: req.url,
                headers: sanitizeHeaders(req.headers),
                remoteAddress: req.remoteAddress,
                remotePort: req.remotePort,
                userAgent: req.headers['user-agent']
            }
        },
        res: (res) => {
            return {
                statusCode: res.statusCode,
                headers: sanitizeHeaders(res.getHeaders())
            }
        },
        err: (err) => {
            return {
                type: err.constructor.name,
                message: sanitizeHtml(err.message, sanitizeOptions),
                stack: sanitizeHtml(err.stack, sanitizeOptions),
                code: err.code,
                statusCode: err.statusCode
            }
        }
    },
    transport: isProduction
        ? undefined
        : {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard",
                singleLine: false,
                ignore: "pid,hostname"
            },
        },
})


function sanitizeHeaders(headers) {
    const sanitized = { ...headers }
    const sensitiveHeaders = [
        'authorization',
        'cookie',
        'x-api-key',
        'x-auth-token',
        'x-access-token',
        'x-csrf-token',
        'x-session-id'
    ]

    sensitiveHeaders.forEach(header => {
        if (sanitized[header]) {
            sanitized[header] = '[REDACTED]'
        }
    })

    return sanitized
}


function sanitizeForLogging(input) {
    if (typeof input === 'string') {
        return sanitizeHtml(input, sanitizeOptions)
    }
    if (typeof input === 'object' && input !== null) {
        const sanitized = {}
        for (const [key, value] of Object.entries(input)) {
            if (typeof value === 'string') {
                sanitized[key] = sanitizeHtml(value, sanitizeOptions)
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeForLogging(value)
            } else {
                sanitized[key] = value
            }
        }
        return sanitized
    }
    return input
}


const enhancedLogger = {
    ...logger,


    info: (obj, msg, ...args) => {
        const sanitizedObj = sanitizeForLogging(obj)
        logger.info(sanitizedObj, msg, ...args)
    },


    error: (obj, msg, ...args) => {
        const sanitizedObj = sanitizeForLogging(obj)
        logger.error(sanitizedObj, msg, ...args)
    },


    warn: (obj, msg, ...args) => {
        const sanitizedObj = sanitizeForLogging(obj)
        logger.warn(sanitizedObj, msg, ...args)
    },


    debug: (obj, msg, ...args) => {
        const sanitizedObj = sanitizeForLogging(obj)
        logger.debug(sanitizedObj, msg, ...args)
    },


    logHttpRequest: (req, res, responseTime) => {
        const logData = {
            type: 'http_request',
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime: `${ responseTime }ms`,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            contentLength: res.get('content-length') || 0
        }

        if (res.statusCode >= 400) {
            enhancedLogger.warn(logData, `HTTP ${ req.method } ${ req.url } - ${ res.statusCode }`)
        } else {
            enhancedLogger.info(logData, `HTTP ${ req.method } ${ req.url } - ${ res.statusCode }`)
        }
    },


    logSecurityEvent: (event, details = {}) => {
        const logData = {
            type: 'security_event',
            event,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        }
        enhancedLogger.warn(logData, `Security Event: ${ event }`)
    },


    logPerformance: (operation, duration, details = {}) => {
        const logData = {
            type: 'performance',
            operation,
            duration: `${ duration }ms`,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        }
        enhancedLogger.info(logData, `Performance: ${ operation } completed in ${ duration }ms`)
    },


    logDatabaseOperation: (operation, collection, duration, details = {}) => {
        const logData = {
            type: 'database_operation',
            operation,
            collection,
            duration: `${ duration }ms`,
            timestamp: new Date().toISOString(),
            ...sanitizeForLogging(details)
        }
        enhancedLogger.debug(logData, `DB ${ operation } on ${ collection } - ${ duration }ms`)
    }
}


function getModuleLogger(moduleName) {
    return enhancedLogger.child({ module: moduleName })
}


function getRequestLogger(req) {
    return enhancedLogger.child({
        requestId: req.id || require('crypto').randomUUID(),
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress
    })
}

module.exports = Object.assign(enhancedLogger, {
    getModuleLogger,
    getRequestLogger,
    sanitizeForLogging,
    sanitizeHeaders
})


