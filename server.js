#!/usr/bin/env node

require('dotenv').config()

// Initialize Sentry before anything else
if (process.env.SENTRY_ENABLED === 'true' && process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node')

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) : 1.0,
        profilesSampleRate: process.env.SENTRY_PROFILES_SAMPLE_RATE ? parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) : 1.0,
        integrations: [
            new Sentry.Integrations.Http({ tracing: true })
        ],
        beforeSend(event, hint) {
            // Filter out sensitive data
            if (event.request) {
                if (event.request.headers) {
                    delete event.request.headers.authorization
                    delete event.request.headers.cookie
                }
                if (event.request.data) {
                    if (typeof event.request.data === 'object') {
                        delete event.request.data.password
                        delete event.request.data.token
                        delete event.request.data.secretCode
                    }
                }
            }
            // Filter sensitive data from user context
            if (event.user) {
                delete event.user.email
                delete event.user.phone
            }
            return event
        }
    })

    console.log('✅ Sentry initialized successfully')
}

const app = require('./app')
const logger = require('./utils/logger')
const connectDb = require('./config/dbConfig')
const { initializeSocket } = require('./socket/socketServer')
const mongoose = require('mongoose')

const PORT = process.env.PORT || 57788
const HOST = process.env.HOST || '0.0.0.0'
const NODE_ENV = process.env.NODE_ENV || 'development'



let server

(async () => {
    try {
        // Collect initialization statuses
        const initStatus = {
            database: null,
            socket: null,
            backgroundJobs: null,
            cache: null,
            s3: null,
            cloudinary: null,
            missingConfigs: []
        }

        // Connect to database
        await connectDb()
        initStatus.database = {
            initialized: true,
            host: mongoose.connection.host,
            name: mongoose.connection.name
        }

        // Start server first (needed for Socket.io)
        server = app.listen(PORT, HOST, async () => {
            // Initialize Socket.io
            const io = initializeSocket(server)
            app.set('io', io)
            initStatus.socket = { initialized: true }

            // Initialize background jobs
            const backgroundJobService = require('./services/backgroundJobService')
            initStatus.backgroundJobs = backgroundJobService.initialize()

            // Initialize cache service
            const cacheService = require('./services/cacheService')
            initStatus.cache = await cacheService.initialize()

            // Initialize push notification service
            const pushNotificationService = require('./services/pushNotificationService')
            const pushStatus = await pushNotificationService.initialize()
            if (pushStatus.initialized) {
                initStatus.pushNotifications = pushStatus
            } else {
                initStatus.missingConfigs.push('Push Notifications')
            }

            // Initialize S3 and Cloudinary
            const { initializeS3 } = require('./config/s3Config')
            const { initializeCloudinary } = require('./config/cloudinaryConfig')

            const s3Status = initializeS3()
            if (s3Status && s3Status.initialized) {
                initStatus.s3 = s3Status
            } else {
                initStatus.missingConfigs.push('S3')
            }

            const cloudinaryStatus = initializeCloudinary()
            if (cloudinaryStatus && cloudinaryStatus.initialized) {
                initStatus.cloudinary = cloudinaryStatus
            } else {
                initStatus.missingConfigs.push('Cloudinary')
            }

            // Log all initialization statuses in one message
            const initialized = []
            if (initStatus.database?.initialized) initialized.push('Database')
            if (initStatus.socket?.initialized) initialized.push('Socket.io')
            if (initStatus.backgroundJobs?.initialized) initialized.push('Background Jobs')
            if (initStatus.cache?.initialized) initialized.push(`Cache (${ initStatus.cache.type })`)
            if (initStatus.s3?.initialized) initialized.push('AWS S3')
            if (initStatus.cloudinary?.initialized) initialized.push('Cloudinary')
            if (initStatus.pushNotifications?.initialized) initialized.push(`Push Notifications (${ initStatus.pushNotifications.provider })`)

            // Log consolidated server startup information
            const serverUrl = `http://${ HOST === '0.0.0.0' ? 'localhost' : HOST }:${ PORT }`
            const swaggerUrl = `${ serverUrl }/api-docs`
            const swaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true'

            const startupInfo = {
                type: 'server_startup',
                app: require('./package.json').name || 'voteapi',
                version: require('./package.json').version || '1.0.0',
                env: NODE_ENV,
                port: PORT.toString(),
                host: HOST === '0.0.0.0' ? 'localhost' : HOST,
                environment: NODE_ENV,
                nodeVersion: process.version,
                initialized: initialized.join(', '),
                backgroundJobs: initStatus.backgroundJobs?.jobs?.length || 0
            }

            if (swaggerEnabled) {
                startupInfo.swaggerUrl = swaggerUrl
            }

            const logMessage = `Application is running on: ${ serverUrl }${ swaggerEnabled ? `\n    Swagger documentation: ${ swaggerUrl }` : '' }`

            logger.info(startupInfo, logMessage)

            // Log missing configs in one message if any
            if (initStatus.missingConfigs.length > 0) {
                logger.warn({
                    type: 'missing_configurations',
                    services: initStatus.missingConfigs.join(', ')
                }, `⚠️  Missing configurations: ${ initStatus.missingConfigs.join(', ') } - These features will be disabled`)
            }
        })

        server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error
            }

            const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT

            switch (error.code) {
                case 'EACCES':
                    logger.error({
                        type: 'server_error',
                        error: 'EACCES',
                        port: PORT,
                        message: `${ bind } requires elevated privileges`
                    }, `${ bind } requires elevated privileges`)
                    process.exit(1)
                    break
                case 'EADDRINUSE':
                    logger.error({
                        type: 'server_error',
                        error: 'EADDRINUSE',
                        port: PORT,
                        message: `${ bind } is already in use`
                    }, `${ bind } is already in use`)
                    process.exit(1)
                    break
                default:
                    logger.error({
                        type: 'server_error',
                        error: error.code,
                        port: PORT,
                        message: error.message
                    }, `Server error: ${ error.message }`)
                    throw error
            }
        })
    } catch (err) {
        logger.error({ type: 'server_startup_error', error: err?.message }, 'Failed to start server')
        process.exit(1)
    }
})()



const gracefulShutdown = (signal) => {
    logger.info({
        type: 'server_shutdown',
        signal: signal,
        port: PORT
    }, `Received ${ signal }, shutting down gracefully`)

    if (!server) {
        process.exit(0)
        return
    }

    server.close((err) => {
        if (err) {
            logger.error({
                type: 'server_shutdown_error',
                error: err.message,
                signal: signal
            }, `Error during server shutdown: ${ err.message }`)
            process.exit(1)
        }

        logger.info({
            type: 'server_shutdown_complete',
            signal: signal
        }, 'Server shutdown complete')
        process.exit(0)
    })

    setTimeout(() => {
        logger.warn({
            type: 'server_force_shutdown',
            signal: signal
        }, 'Forcing server shutdown after timeout')
        process.exit(1)
    }, 30000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

process.on('uncaughtException', (error) => {
    logger.error({
        type: 'uncaught_exception',
        error: error.message,
        stack: error.stack
    }, 'Uncaught Exception - shutting down')
    gracefulShutdown('UNCAUGHT_EXCEPTION')
})

process.on('unhandledRejection', (reason, promise) => {
    logger.error({
        type: 'unhandled_promise_rejection',
        reason: reason?.message || reason,
        stack: reason?.stack
    }, 'Unhandled Promise Rejection - shutting down')
    gracefulShutdown('UNHANDLED_REJECTION')
})

module.exports = server
