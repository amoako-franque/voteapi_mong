const logger = require('../utils/logger')
const pinoHttp = require('pino-http')
const pino = require('pino')

const baseLogger = pino({
    name: 'voteapi-http',
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    base: {
        app: 'voteapi',
        version: '1.0.0',
        env: process.env.NODE_ENV || 'development',
    }
})

const httpLogger = pinoHttp({
    logger: baseLogger,
    genReqId: (req) => {
        return req.id || require('crypto').randomUUID()
    },
    serializers: {
        req: (req) => {
            return {
                id: req.id,
                method: req.method,
                url: req.url,
                headers: logger.sanitizeHeaders(req.headers),
                remoteAddress: req.remoteAddress,
                remotePort: req.remotePort,
                userAgent: req.headers['user-agent'],
                ip: req.ip || req.connection.remoteAddress
            }
        },
        res: (res) => {
            return {
                statusCode: res.statusCode,
                headers: logger.sanitizeHeaders(res.getHeaders()),
                contentLength: res.get('content-length') || 0
            }
        },
        err: (err) => {
            return {
                type: err.constructor.name,
                message: logger.sanitizeForLogging(err.message),
                stack: logger.sanitizeForLogging(err.stack),
                code: err.code,
                statusCode: err.statusCode
            }
        }
    },
    customLogLevel: (req, res, err) => {
        if (res.statusCode >= 400 && res.statusCode < 500) {
            return 'warn'
        } else if (res.statusCode >= 500) {
            return 'error'
        } else if (res.statusCode >= 300) {
            return 'info'
        }
        return 'info'
    },
    customSuccessMessage: (req, res) => {
        if (res.statusCode >= 400) {
            return `HTTP ${ req.method } ${ req.url } - ${ res.statusCode }`
        }
        return `HTTP ${ req.method } ${ req.url } - ${ res.statusCode }`
    },
    customErrorMessage: (req, res, err) => {
        return `HTTP ${ req.method } ${ req.url } - ${ res.statusCode } - ${ err.message }`
    },
    customAttributeKeys: {
        req: 'request',
        res: 'response',
        err: 'error',
        responseTime: 'responseTime'
    },
    customProps: (req, res) => {
        return {
            requestId: req.id,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            responseTime: res.responseTime
        }
    }
})

const enhancedHttpLogger = (req, res, next) => {
    const startTime = Date.now()

    if (!req.id) {
        req.id = require('crypto').randomUUID()
    }

    req.logger = baseLogger.child({
        requestId: req.id,
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress
    })

    req.logger.info({
        type: 'http_request_start',
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
    }, `Request started: ${ req.method } ${ req.url }`)

    const originalEnd = res.end
    res.end = function (chunk, encoding) {
        const responseTime = Date.now() - startTime
        res.responseTime = responseTime

        logger.logHttpRequest(req, res, responseTime)

        if (responseTime > 1000) {
            logger.logPerformance('http_request', responseTime, {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode
            })
        }

        originalEnd.call(this, chunk, encoding)
    }

    res.on('error', (err) => {
        const responseTime = Date.now() - startTime
        req.logger.error({
            type: 'http_request_error',
            error: err.message,
            stack: err.stack,
            method: req.method,
            url: req.url,
            responseTime: `${ responseTime }ms`
        }, `Request error: ${ req.method } ${ req.url }`)
    })

    next()
}

const securityLogger = (req, res, next) => {
    const suspiciousPatterns = [
        /\.\.\//,
        /<script/i,
        /union\s+select/i,
        /javascript:/i,
        /on\w+\s*=/i
    ]

    const url = req.url
    const userAgent = req.headers['user-agent'] || ''
    const body = JSON.stringify(req.body || {})

    const isSuspicious = suspiciousPatterns.some(pattern =>
        pattern.test(url) || pattern.test(userAgent) || pattern.test(body)
    )

    if (isSuspicious) {
        logger.logSecurityEvent('suspicious_request', {
            method: req.method,
            url: req.url,
            userAgent: userAgent,
            ip: req.ip || req.connection.remoteAddress,
            body: logger.sanitizeForLogging(req.body)
        })
    }

    next()
}

const rateLimitLogger = (req, res, next) => {
    const originalSend = res.send
    res.send = function (data) {
        if (res.statusCode === 429) {
            logger.logSecurityEvent('rate_limit_exceeded', {
                method: req.method,
                url: req.url,
                ip: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
            })
        }
        return originalSend.call(this, data)
    }
    next()
}

module.exports = {
    httpLogger,
    enhancedHttpLogger,
    securityLogger,
    rateLimitLogger
}
