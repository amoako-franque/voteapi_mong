const logger = require('../utils/logger')

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true)

        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:8080',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:8080',
            // Add production domains here
            process.env.FRONTEND_URL,
            process.env.ADMIN_URL
        ].filter(Boolean)

        // In development, allow all origins
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true)
        }

        // Check if origin is allowed
        if (allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            logger.logSecurityEvent('cors_violation', {
                origin,
                allowedOrigins,
                userAgent: 'unknown'
            })
            callback(new Error('Not allowed by CORS'))
        }
    },
    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
        'HEAD'
    ],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-CSRF-Token',
        'X-Request-ID',
        'Cache-Control',
        'Pragma'
    ],
    exposedHeaders: [
        'X-Request-ID',
        'X-Response-Time',
        'X-Rate-Limit-Limit',
        'X-Rate-Limit-Remaining',
        'X-Rate-Limit-Reset'
    ],
    credentials: true, // Allow cookies and authorization headers
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
}

// CORS error handler
const corsErrorHandler = (err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
        logger.logSecurityEvent('cors_blocked', {
            origin: req.headers.origin,
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress
        })

        return res.status(403).json({
            success: false,
            error: 'CORS policy violation',
            message: 'Origin not allowed by CORS policy',
            code: 'CORS_ERROR'
        })
    }
    next(err)
}

// CORS preflight handler
const corsPreflightHandler = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        logger.info({
            type: 'cors_preflight',
            method: req.method,
            url: req.url,
            origin: req.headers.origin,
            userAgent: req.headers['user-agent']
        }, 'CORS preflight request')
    }
    next()
}

module.exports = {
    corsOptions,
    corsErrorHandler,
    corsPreflightHandler
}
