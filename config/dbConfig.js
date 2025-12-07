const mongoose = require('mongoose')
const logger = require('../utils/logger')
const winstonLogger = require('../utils/winstonLogger')

mongoose.set('strictQuery', false)

const db_connection = async () => {
    try {
        mongoose.connection.on('connected', () => {
            // Connection logged in server.js
        })

        mongoose.connection.on('error', (error) => {
            logger.error({
                type: 'database_error',
                error: error.message
            }, 'MongoDB connection error')
        })

        mongoose.connection.on('disconnected', () => {
            logger.warn({
                type: 'database_disconnection'
            }, 'MongoDB disconnected')
        })

        await mongoose.connect(process.env.MONGODB_URI)

    } catch (error) {
        logger.error({
            type: 'database_connection_failed',
            error: error.message,
            stack: error.stack
        }, 'Connection to MongoDB failed')
        throw error
    }
}

module.exports = db_connection
