const HTTP_STATUS = require('../utils/constants').HTTP_STATUS
const logger = require('../utils/logger')
const responseFormatter = require('../utils/responseFormatter')
const User = require('../models/User')
const Election = require('../models/Election')
const School = require('../models/School')
const Association = require('../models/Association')

/**
 * Role hierarchy for permission checking
 */
const ROLE_HIERARCHY = {
    'SUPER_ADMIN': 5,
    'ADMIN': 4,
    'SCHOOL_ADMIN': 3,
    'ASSOCIATION_ADMIN': 3,
    'PROFESSIONAL_ASSOCIATION_ADMIN': 3,
    'ELECTION_OFFICER': 2,
    'VOTER': 1
}

/**
 * Check if user has required role
 * @param {string|string[]} requiredRoles - Single role or array of roles
 * @returns {Function} Express middleware
 */
const requireRole = (requiredRoles) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.role) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                    responseFormatter.error('Authentication required', HTTP_STATUS.UNAUTHORIZED)
                )
            }

            const userRole = req.user.role
            const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles]

            // Check if user has one of the required roles
            if (!roles.includes(userRole)) {
                logger.warn({
                    type: 'permission_denied_role',
                    userId: req.user.id,
                    userRole,
                    requiredRoles: roles,
                    path: req.path
                }, 'Access denied: insufficient role')

                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('Insufficient permissions: role required', HTTP_STATUS.FORBIDDEN)
                )
            }

            next()
        } catch (error) {
            logger.error({
                type: 'permission_middleware_error',
                error: error.message
            }, 'Permission middleware error')
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
                responseFormatter.error('Permission check failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
            )
        }
    }
}

/**
 * Check if user has required permission
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions
 * @returns {Function} Express middleware
 */
const requirePermission = (requiredPermissions) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                    responseFormatter.error('Authentication required', HTTP_STATUS.UNAUTHORIZED)
                )
            }

            // Get full user with permissions
            const user = await User.findById(req.user.id)
            if (!user || !user.permissions) {
                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('User permissions not found', HTTP_STATUS.FORBIDDEN)
                )
            }

            const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions]

            // SUPER_ADMIN and ADMIN have all permissions
            if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
                return next()
            }

            // Check if user has all required permissions
            const hasAllPermissions = permissions.every(permission => {
                return user.permissions[permission] === true
            })

            if (!hasAllPermissions) {
                logger.warn({
                    type: 'permission_denied',
                    userId: req.user.id,
                    userRole: user.role,
                    requiredPermissions: permissions,
                    path: req.path
                }, 'Access denied: insufficient permissions')

                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('Insufficient permissions', HTTP_STATUS.FORBIDDEN)
                )
            }

            next()
        } catch (error) {
            logger.error({
                type: 'permission_middleware_error',
                error: error.message
            }, 'Permission middleware error')
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
                responseFormatter.error('Permission check failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
            )
        }
    }
}

/**
 * Check if user owns or has access to a resource
 * @param {string} resourceType - Type of resource ('election', 'school', 'association')
 * @param {string} paramName - Name of the parameter containing the resource ID (default: 'id')
 * @returns {Function} Express middleware
 */
const requireResourceAccess = (resourceType, paramName = 'id') => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                    responseFormatter.error('Authentication required', HTTP_STATUS.UNAUTHORIZED)
                )
            }

            const userId = req.user.id
            const userRole = req.user.role
            const resourceId = req.params[paramName]

            if (!resourceId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Resource ID is required', HTTP_STATUS.BAD_REQUEST)
                )
            }

            // SUPER_ADMIN and ADMIN have access to all resources
            if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
                return next()
            }

            // Get full user with schoolId and associationId
            const user = await User.findById(userId)
            if (!user) {
                return res.status(HTTP_STATUS.NOT_FOUND).json(
                    responseFormatter.error('User not found', HTTP_STATUS.NOT_FOUND)
                )
            }

            let hasAccess = false

            switch (resourceType) {
                case 'election':
                    const election = await Election.findById(resourceId)
                    if (!election) {
                        return res.status(HTTP_STATUS.NOT_FOUND).json(
                            responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
                        )
                    }

                    // Check if user created the election
                    if (election.createdBy && election.createdBy.toString() === userId) {
                        hasAccess = true
                    }
                    // Check if user's school/association matches election's school/association
                    else if (election.schoolId && user.schoolId && election.schoolId.toString() === user.schoolId.toString()) {
                        hasAccess = true
                    }
                    else if (election.associationId && user.associationId && election.associationId.toString() === user.associationId.toString()) {
                        hasAccess = true
                    }
                    break

                case 'school':
                    const school = await School.findById(resourceId)
                    if (!school) {
                        return res.status(HTTP_STATUS.NOT_FOUND).json(
                            responseFormatter.error('School not found', HTTP_STATUS.NOT_FOUND)
                        )
                    }

                    // Check if user's school matches
                    if (user.schoolId && school._id.toString() === user.schoolId.toString()) {
                        hasAccess = true
                    }
                    break

                case 'association':
                    const association = await Association.findById(resourceId)
                    if (!association) {
                        return res.status(HTTP_STATUS.NOT_FOUND).json(
                            responseFormatter.error('Association not found', HTTP_STATUS.NOT_FOUND)
                        )
                    }

                    // Check if user's association matches
                    if (user.associationId && association._id.toString() === user.associationId.toString()) {
                        hasAccess = true
                    }
                    break

                default:
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(
                        responseFormatter.error('Invalid resource type', HTTP_STATUS.BAD_REQUEST)
                    )
            }

            if (!hasAccess) {
                logger.warn({
                    type: 'resource_access_denied',
                    userId,
                    userRole,
                    resourceType,
                    resourceId,
                    path: req.path
                }, 'Access denied: insufficient resource access')

                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('You do not have access to this resource', HTTP_STATUS.FORBIDDEN)
                )
            }

            next()
        } catch (error) {
            logger.error({
                type: 'resource_access_middleware_error',
                error: error.message
            }, 'Resource access middleware error')
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
                responseFormatter.error('Resource access check failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
            )
        }
    }
}

/**
 * Check if user has role hierarchy access (user role must be >= required role)
 * @param {string} minimumRole - Minimum required role
 * @returns {Function} Express middleware
 */
const requireMinimumRole = (minimumRole) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.role) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                    responseFormatter.error('Authentication required', HTTP_STATUS.UNAUTHORIZED)
                )
            }

            const userRole = req.user.role
            const userRoleLevel = ROLE_HIERARCHY[userRole] || 0
            const minimumRoleLevel = ROLE_HIERARCHY[minimumRole] || 0

            if (userRoleLevel < minimumRoleLevel) {
                logger.warn({
                    type: 'permission_denied_hierarchy',
                    userId: req.user.id,
                    userRole,
                    minimumRole,
                    path: req.path
                }, 'Access denied: insufficient role level')

                return res.status(HTTP_STATUS.FORBIDDEN).json(
                    responseFormatter.error('Insufficient permissions: higher role required', HTTP_STATUS.FORBIDDEN)
                )
            }

            next()
        } catch (error) {
            logger.error({
                type: 'permission_middleware_error',
                error: error.message
            }, 'Permission middleware error')
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
                responseFormatter.error('Permission check failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
            )
        }
    }
}

/**
 * Check if user is admin (SUPER_ADMIN or ADMIN)
 */
const requireAdmin = requireRole(['SUPER_ADMIN', 'ADMIN'])

/**
 * Check if user is school or association admin
 */
const requireSchoolOrAssociationAdmin = requireRole(['SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN'])

/**
 * Check if user can manage elections
 */
const requireElectionManagement = requirePermission('canCreateElection')

/**
 * Check if user can manage voters
 */
const requireVoterManagement = requirePermission('canManageVoters')

module.exports = {
    requireRole,
    requirePermission,
    requireResourceAccess,
    requireMinimumRole,
    requireAdmin,
    requireSchoolOrAssociationAdmin,
    requireElectionManagement,
    requireVoterManagement,
    ROLE_HIERARCHY
}

