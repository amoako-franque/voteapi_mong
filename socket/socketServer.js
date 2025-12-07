const { Server } = require('socket.io')
const logger = require('../utils/logger')
const socketAuthMiddleware = require('../middleware/socketAuthMiddleware')

/**
 * Initialize Socket.io server
 */
function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        transports: ['websocket', 'polling']
    })

    // Socket authentication middleware
    io.use(socketAuthMiddleware)

    // Connection handler
    io.on('connection', (socket) => {
        logger.info({
            type: 'socket_connected',
            socketId: socket.id,
            userId: socket.userId,
            userRole: socket.userRole
        }, 'Socket client connected')

        // Join election room
        socket.on('join:election', (electionId) => {
            const room = `election:${ electionId }`
            socket.join(room)
            logger.info({
                type: 'socket_joined_room',
                socketId: socket.id,
                room,
                userId: socket.userId
            }, `Socket joined election room: ${ room }`)
        })

        // Leave election room
        socket.on('leave:election', (electionId) => {
            const room = `election:${ electionId }`
            socket.leave(room)
            logger.info({
                type: 'socket_left_room',
                socketId: socket.id,
                room,
                userId: socket.userId
            }, `Socket left election room: ${ room }`)
        })

        // Join admin room (for admin dashboard)
        socket.on('join:admin', () => {
            if (socket.userRole === 'SUPER_ADMIN' || socket.userRole === 'ADMIN') {
                socket.join('admin')
                logger.info({
                    type: 'socket_joined_admin',
                    socketId: socket.id,
                    userId: socket.userId
                }, 'Socket joined admin room')
            } else {
                socket.emit('error', { message: 'Unauthorized: Admin access required' })
            }
        })

        // Join user notification room (for real-time notifications)
        if (socket.userId) {
            const notificationRoom = `notifications:${socket.userId}`
            socket.join(notificationRoom)
            logger.info({
                type: 'socket_joined_notifications',
                socketId: socket.id,
                userId: socket.userId,
                room: notificationRoom
            }, 'Socket joined notification room')

            // Send pending notifications when user connects
            socket.emit('notifications:connected', {
                message: 'Connected to notification service',
                timestamp: new Date()
            })
        }

        // Disconnect handler
        socket.on('disconnect', (reason) => {
            logger.info({
                type: 'socket_disconnected',
                socketId: socket.id,
                userId: socket.userId,
                reason
            }, 'Socket client disconnected')
        })

        // Error handler
        socket.on('error', (error) => {
            logger.error({
                type: 'socket_error',
                socketId: socket.id,
                userId: socket.userId,
                error: error.message
            }, 'Socket error occurred')
        })
    })

    return io
}

module.exports = { initializeSocket }

