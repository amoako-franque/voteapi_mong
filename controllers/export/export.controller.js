const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const Election = require('../../models/Election')
const VoterRegistry = require('../../models/VoterRegistry')
const Candidate = require('../../models/Candidate')
const Position = require('../../models/Position')
const Vote = require('../../models/Vote')
const Poll = require('../../models/Poll')
const User = require('../../models/User')
const papaparse = require('papaparse')

/**
 * Export elections
 * GET /api/export/elections
 */
const exportElections = async (req, res) => {
    try {
        const { format = 'csv', electionId } = req.query

        let query = {}
        if (electionId) {
            query._id = electionId
        } else if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
            query.createdBy = req.user._id
        }

        const elections = await Election.find(query)
            .populate('schoolId', 'name code')
            .populate('associationId', 'name code')
            .populate('createdBy', 'firstname lastname email')
            .sort({ createdAt: -1 })

        if (format === 'csv') {
            const csv = papaparse.unparse(elections.map(e => ({
                id: e._id,
                title: e.title,
                description: e.description,
                type: e.type,
                scope: e.scope,
                status: e.status,
                startDateTime: e.startDateTime,
                endDateTime: e.endDateTime,
                school: e.schoolId?.name || '',
                association: e.associationId?.name || '',
                createdBy: e.createdBy ? `${e.createdBy.firstname} ${e.createdBy.lastname}` : '',
                createdAt: e.createdAt
            })))

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="elections-${Date.now()}.csv"`)
            return res.send(csv)
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
            responseFormatter.error('Only CSV format is supported', HTTP_STATUS.BAD_REQUEST)
        )
    } catch (error) {
        logger.error({
            type: 'export_elections_error',
            error: error.message
        }, 'Failed to export elections')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export elections', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export voters
 * GET /api/export/voters
 */
const exportVoters = async (req, res) => {
    try {
        const { format = 'csv', electionId } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const voters = await VoterRegistry.find({ electionId })
            .populate('schoolId', 'name code')
            .sort({ createdAt: -1 })

        if (format === 'csv') {
            const csv = papaparse.unparse(voters.map(v => ({
                voterId: v.voterId,
                email: v.email,
                firstname: v.firstname,
                lastname: v.lastname,
                phone: v.phone,
                studentId: v.studentId,
                yearOfStudy: v.yearOfStudy,
                department: v.department,
                verified: v.verified,
                eligible: v.eligible,
                school: v.schoolId?.name || '',
                createdAt: v.createdAt
            })))

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="voters-${electionId}-${Date.now()}.csv"`)
            return res.send(csv)
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
            responseFormatter.error('Only CSV format is supported', HTTP_STATUS.BAD_REQUEST)
        )
    } catch (error) {
        logger.error({
            type: 'export_voters_error',
            error: error.message
        }, 'Failed to export voters')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export voters', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export candidates
 * GET /api/export/candidates
 */
const exportCandidates = async (req, res) => {
    try {
        const { format = 'csv', electionId, positionId } = req.query

        const query = {}
        if (electionId) query.electionId = electionId
        if (positionId) query.positionId = positionId

        const candidates = await Candidate.find(query)
            .populate('positionId', 'title')
            .populate('electionId', 'title')
            .sort({ createdAt: -1 })

        if (format === 'csv') {
            const csv = papaparse.unparse(candidates.map(c => ({
                id: c._id,
                fullName: c.fullName,
                email: c.email,
                studentId: c.studentId,
                position: c.positionId?.title || '',
                election: c.electionId?.title || '',
                status: c.status,
                manifesto: c.manifesto,
                createdAt: c.createdAt
            })))

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="candidates-${Date.now()}.csv"`)
            return res.send(csv)
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
            responseFormatter.error('Only CSV format is supported', HTTP_STATUS.BAD_REQUEST)
        )
    } catch (error) {
        logger.error({
            type: 'export_candidates_error',
            error: error.message
        }, 'Failed to export candidates')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export candidates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export polls
 * GET /api/export/polls
 */
const exportPolls = async (req, res) => {
    try {
        const { format = 'csv', pollId } = req.query

        let query = {}
        if (pollId) {
            query._id = pollId
        } else if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
            query.createdBy = req.user._id
        }

        const polls = await Poll.find(query)
            .populate('createdBy', 'firstname lastname email')
            .sort({ createdAt: -1 })

        if (format === 'csv') {
            const csv = papaparse.unparse(polls.map(p => ({
                id: p._id,
                title: p.title,
                description: p.description,
                pollType: p.pollType,
                category: p.category,
                status: p.status,
                visibility: p.visibility,
                startDate: p.startDate,
                endDate: p.endDate,
                totalVotes: p.statistics?.totalVotes || 0,
                createdBy: p.createdBy ? `${p.createdBy.firstname} ${p.createdBy.lastname}` : 'Anonymous',
                createdAt: p.createdAt
            })))

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="polls-${Date.now()}.csv"`)
            return res.send(csv)
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
            responseFormatter.error('Only CSV format is supported', HTTP_STATUS.BAD_REQUEST)
        )
    } catch (error) {
        logger.error({
            type: 'export_polls_error',
            error: error.message
        }, 'Failed to export polls')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export polls', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export users
 * GET /api/export/users
 */
const exportUsers = async (req, res) => {
    try {
        const { format = 'csv', role } = req.query

        if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only admins can export users', HTTP_STATUS.FORBIDDEN)
            )
        }

        const query = {}
        if (role) query.role = role

        const users = await User.find(query)
            .select('-password -twoFactorSecret')
            .sort({ createdAt: -1 })

        if (format === 'csv') {
            const csv = papaparse.unparse(users.map(u => ({
                id: u._id,
                email: u.email,
                firstname: u.firstname,
                lastname: u.lastname,
                username: u.username,
                phone: u.phone,
                role: u.role,
                isActive: u.isActive,
                isSuspended: u.isSuspended,
                verified: u.verified,
                lastLogin: u.lastLogin,
                createdAt: u.createdAt
            })))

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="users-${Date.now()}.csv"`)
            return res.send(csv)
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
            responseFormatter.error('Only CSV format is supported', HTTP_STATUS.BAD_REQUEST)
        )
    } catch (error) {
        logger.error({
            type: 'export_users_error',
            error: error.message
        }, 'Failed to export users')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export users', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    exportElections,
    exportVoters,
    exportCandidates,
    exportPolls,
    exportUsers
}

