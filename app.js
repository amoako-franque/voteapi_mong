const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const hpp = require('hpp')

const logger = require('./utils/logger')
const { corsOptions, corsErrorHandler, corsPreflightHandler } = require('./config/cors')
const { enhancedHttpLogger, securityLogger, rateLimitLogger } = require('./middleware/httpLogger')
const { handleError, handleNotFound } = require('./middleware/errorHandler')
// const { logSensitiveRequests } = require('./middleware/auditMiddleware')
const { csrfMiddleware, isCsrfExempt } = require('./middleware/csrfMiddleware')
const { combinedSecurityMiddleware } = require('./middleware/securityMiddleware')
const authRoutes = require('./routes/auth.routes')
const electionRoutes = require('./routes/election.routes')
const positionRoutes = require('./routes/position.routes')
const voterRoutes = require('./routes/voter.routes')
const candidateRoutes = require('./routes/candidate.routes')
const schoolRoutes = require('./routes/school.routes')
const associationRoutes = require('./routes/association.routes')
const voteRoutes = require('./routes/vote.routes')
const resultRoutes = require('./routes/result.routes')
const adminRoutes = require('./routes/admin.routes')
const userRoutes = require('./routes/user.routes')
const notificationRoutes = require('./routes/notification.routes')
const pollRoutes = require('./routes/poll.routes')
const auditRoutes = require('./routes/audit.routes')
const reportRoutes = require('./routes/report.routes')
const publicRoutes = require('./routes/public.routes')
const fileRoutes = require('./routes/file.routes')
const bulkRoutes = require('./routes/bulk.routes')
const exportRoutes = require('./routes/export.routes')
const emailTemplateRoutes = require('./routes/emailTemplate.routes')
const analyticsRoutes = require('./routes/analytics.routes')

const app = express()

app.set('trust proxy', 1)

// Initialize Sentry request handler if enabled
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node')
    app.use(Sentry.Handlers.requestHandler())
    app.use(Sentry.Handlers.tracingHandler())
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}))

app.use(cors(corsOptions))
app.use(corsPreflightHandler)
app.use(corsErrorHandler)

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: {
        success: false,
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.logSecurityEvent('rate_limit_exceeded', {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            url: req.url,
            method: req.method
        })
        res.status(429).json({
            success: false,
            error: 'Too many requests',
            message: 'Too many requests from this IP, please try again later.',
            retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
        })
    }
})

app.use(limiter) // Global IP-based rate limiter
app.use(rateLimitLogger)

// Per-user rate limiter (applied after authentication)
const { userRateLimiter } = require('./middleware/userRateLimit')
// Note: userRateLimiter should be applied to routes that require authentication
// It will be applied in individual route files where needed

app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf
    }
}))
app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}))

app.use(cookieParser())

app.use(hpp())

app.use(compression({ threshold: 1024 }))

app.use(securityLogger)

app.use(combinedSecurityMiddleware)

// Audit disabled
// app.use(logSensitiveRequests)

app.use((req, res, next) => {
    if (isCsrfExempt(req.path, req.method, req)) {
        logger.debug({
            type: 'csrf_exempt',
            path: req.path,
            method: req.method,
            reason: req.headers.authorization ? 'API client (JWT token)' : 'exempt path'
        }, 'Route exempt from CSRF protection')
        return next()
    }

    csrfMiddleware(req, res, next)
})

app.use(enhancedHttpLogger)

// API request logging for analytics (must be after enhancedHttpLogger, before routes)
const apiRequestLogger = require('./middleware/apiRequestLogger')
app.use(apiRequestLogger)

// app.use(morgan('combined', {
//     stream: {
//         write: (message) => {
//             logger.info({ type: 'morgan_log' }, message.trim())
//         }
//     }
// }))

const formatUptime = require('./utils/formatUptime')

app.get('/health', (req, res) => {
    const uptime = process.uptime()
    const formattedUptime = formatUptime(uptime)

    res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        uptime: {
            seconds: formattedUptime.raw,
            formatted: formattedUptime.formatted,
            breakdown: formattedUptime.breakdown
        },
        environment: process.env.NODE_ENV || 'development',
        version: require('./package.json').version
    })
})

app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Vote API is running',
        version: require('./package.json').version,
        timestamp: new Date().toISOString()
    })
})

// routes imports
app.use('/api/auth', authRoutes)
app.use('/api/elections', electionRoutes)
app.use('/api/positions', positionRoutes)
app.use('/api/voters', voterRoutes)
app.use('/api/candidates', candidateRoutes)
app.use('/api/schools', schoolRoutes)
app.use('/api/associations', associationRoutes)
app.use('/api/votes', voteRoutes)
app.use('/api/results', resultRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/users', userRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/polls', pollRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/public', publicRoutes)
app.use('/api', fileRoutes)
app.use('/api/bulk', bulkRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/email-templates', emailTemplateRoutes)
app.use('/api/analytics', analyticsRoutes)

// Swagger API Documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const { swaggerSpec, swaggerUi } = require('./config/swagger')

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec.swaggerSpec || swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'VoteAPI Documentation',
        explorer: true
    }))

    logger.info('Swagger API documentation available at /api-docs')
}




app.use(handleNotFound)

// Sentry error handler (must be before custom error handler)
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node')
    app.use(Sentry.Handlers.errorHandler())
}

app.use(handleError)

process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully')
    process.exit(0)
})

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully')
    process.exit(0)
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error({
        type: 'unhandled_promise_rejection',
        reason: reason?.message || reason,
        stack: reason?.stack
    }, 'Unhandled Promise Rejection')
})

process.on('uncaughtException', (error) => {
    logger.error({
        type: 'uncaught_exception',
        error: error.message,
        stack: error.stack
    }, 'Uncaught Exception')
    process.exit(1)
})

module.exports = app