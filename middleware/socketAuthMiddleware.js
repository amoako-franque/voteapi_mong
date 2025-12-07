const authService = require('../services/authService')
const logger = require('../utils/logger')

/**
 * Socket.io authentication middleware
 * Verifies JWT token and attaches user info to socket
 *
 * Usage:
 * io.use(socketAuthMiddleware)
 */
const socketAuthMiddleware = async (socket, next) => {
    try {
        // Get token from handshake auth or headers
        const token = socket.handshake.auth.token ||
            socket.handshake.headers.authorization?.replace('Bearer ', '') ||
            socket.handshake.query?.token

        if (!token) {
            logger.warn({
                type: 'socket_auth_missing_token',
                socketId: socket.id,
                ip: socket.handshake.address
            }, 'Socket connection attempt without token')
            return next(new Error('Authentication token required'))
        }

        // Verify token
        let decoded
        try {
            decoded = await authService.verifyToken(token)
        } catch (error) {
            logger.error({
                type: 'socket_auth_token_verification_failed',
                error: error.message,
                socketId: socket.id,
                ip: socket.handshake.address
            }, 'Socket token verification failed')

            if (error.message && error.message.includes('expired')) {
                return next(new Error('Token expired. Please log in again.'))
            }
            if (error.message && error.message.includes('Invalid')) {
                return next(new Error('Invalid token. Please log in again.'))
            }
            return next(new Error('Authentication failed'))
        }

        // Attach user info to socket
        socket.userId = decoded.id
        socket.userRole = decoded.role
        socket.userEmail = decoded.email

        logger.info({
            type: 'socket_auth_success',
            socketId: socket.id,
            userId: socket.userId,
            userRole: socket.userRole,
            ip: socket.handshake.address
        }, 'Socket authenticated successfully')

        next()
    } catch (error) {
        logger.error({
            type: 'socket_auth_error',
            error: error.message,
            stack: error.stack,
            socketId: socket.id,
            ip: socket.handshake.address
        }, 'Socket authentication error')

        next(new Error('Authentication failed'))
    }
}

/**
 * Optional: Socket authorization middleware
 * Check if user has required role/permission
 *
 * Usage:
 * socket.on('some:event', socketAuthMiddleware.requireRole('ADMIN'), handler)
 */
socketAuthMiddleware.requireRole = (requiredRole) => {
    return async (socket, next) => {
        try {
            if (!socket.userRole) {
                return next(new Error('User not authenticated'))
            }

            // Check if user has required role
            const roleHierarchy = {
                'SUPER_ADMIN': 4,
                'ADMIN': 3,
                'SCHOOL_ADMIN': 2,
                'ASSOCIATION_ADMIN': 2,
                'ELECTION_OFFICER': 1,
                'VOTER': 0
            }

            const userRoleLevel = roleHierarchy[socket.userRole] || 0
            const requiredRoleLevel = roleHierarchy[requiredRole] || 0

            if (userRoleLevel < requiredRoleLevel) {
                logger.warn({
                    type: 'socket_unauthorized',
                    socketId: socket.id,
                    userId: socket.userId,
                    userRole: socket.userRole,
                    requiredRole
                }, 'Socket unauthorized access attempt')
                return next(new Error(`Unauthorized: ${ requiredRole } role required`))
            }

            next()
        } catch (error) {
            logger.error({
                type: 'socket_role_check_error',
                error: error.message,
                socketId: socket.id
            }, 'Socket role check error')
            next(new Error('Authorization check failed'))
        }
    }
}

/**
 * Check if user is admin
 */
socketAuthMiddleware.requireAdmin = () => {
    return socketAuthMiddleware.requireRole('ADMIN')
}

module.exports = socketAuthMiddleware

