const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')
const path = require('path')
const auditLogger = require('./auditLogger')

const fs = require('fs')
const logsDir = path.join(__dirname, '../logs')
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
}

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint()
)

const errorLogFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            stack,
            ...meta
        }, null, 2)
    })
)

const winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? `\n${ JSON.stringify(meta, null, 2) }` : ''
                    return `${ timestamp } [${ level }]: ${ message }${ metaStr }`
                })
            )
        }),

        new DailyRotateFile({
            filename: path.join(logsDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: logFormat
        }),

        new DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '30d',
            format: errorLogFormat
        }),

        new DailyRotateFile({
            filename: path.join(logsDir, 'security-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '90d',
            format: logFormat
        }),

        new DailyRotateFile({
            filename: path.join(logsDir, 'database-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d',
            format: logFormat
        }),

        new winston.transports.File({
            filename: path.join(logsDir, 'audit.json'),
            level: 'info',
            maxsize: '50m',
            maxFiles: 5,
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss.SSS'
                }),
                winston.format.json()
            )
        })
    ],
    // exceptionHandlers: [
    //     new winston.transports.File({
    //         filename: path.join(logsDir, 'exceptions.log'),
    //         format: errorLogFormat
    //     })
    // ],
    rejectionHandlers: [
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            format: errorLogFormat
        })
    ]
})

winstonLogger.logError = (error, context = {}) => {
    winstonLogger.error({
        type: 'application_error',
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        },
        context,
        timestamp: new Date().toISOString()
    })
}

winstonLogger.logSecurity = (event, details = {}) => {
    winstonLogger.warn({
        type: 'security_event',
        event,
        details,
        timestamp: new Date().toISOString()
    }, `Security Event: ${ event }`)
}

winstonLogger.logDatabase = (operation, details = {}) => {
    winstonLogger.info({
        type: 'database_operation',
        operation,
        details,
        timestamp: new Date().toISOString()
    }, `Database ${ operation }`)
}

winstonLogger.logUserAction = (action, userId, details = {}) => {
    winstonLogger.info({
        type: 'user_action',
        action,
        userId,
        details,
        timestamp: new Date().toISOString()
    }, `User Action: ${ action }`)
}

winstonLogger.logPerformance = (operation, duration, details = {}) => {
    winstonLogger.info({
        type: 'performance',
        operation,
        duration: `${ duration }ms`,
        details,
        timestamp: new Date().toISOString()
    }, `Performance: ${ operation } - ${ duration }ms`)
}

winstonLogger.logAudit = (action, userId, details = {}) => {
    auditLogger.logAudit(action, userId, details)
    winstonLogger.info(`Audit: ${ action } by user ${ userId }`)
}

winstonLogger.logSystemAudit = (action, details = {}) => {
    auditLogger.logSystemAudit(action, details)
    winstonLogger.info(`System Audit: ${ action }`)
}

winstonLogger.logDataAccess = (operation, resource, userId, details = {}) => {
    auditLogger.logDataAccess(operation, resource, userId, details)
    winstonLogger.info(`Data Access: ${ operation } on ${ resource } by user ${ userId }`)
}

winstonLogger.logConfigurationChange = (setting, oldValue, newValue, userId, details = {}) => {
    auditLogger.logConfigurationChange(setting, oldValue, newValue, userId, details)
    winstonLogger.info(`Configuration Change: ${ setting } changed by user ${ userId }`)
}

module.exports = winstonLogger
