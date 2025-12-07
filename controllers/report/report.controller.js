const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const reportService = require('../../services/reportService')
const { validateObjectId, validate } = require('../../validators/commonValidators')

/**
 * Get election report
 * GET /api/reports/election/:id
 */
const getElectionReport = async (req, res) => {
    try {
        const { id } = req.params
        const { format } = req.query

        if (!validateObjectId('id')(req, res, () => { })) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const report = await reportService.generateElectionReport(id)

        if (format === 'csv') {
            // Export as CSV
            const csv = reportService.exportToCSV(
                report.positions.flatMap(position =>
                    position.candidates.map(candidate => ({
                        'Election': report.election.title,
                        'Position': position.positionTitle,
                        'Candidate': candidate.candidateName,
                        'Votes': candidate.voteCount,
                        'Percentage': candidate.percentage
                    }))
                ),
                ['Election', 'Position', 'Candidate', 'Votes', 'Percentage']
            )

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename=election-report-${ id }-${ Date.now() }.csv`)
            return res.status(HTTP_STATUS.OK).send(csv)
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(report, 'Election report generated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_election_report_error',
            error: error.message,
            electionId: req.params.id
        }, 'Failed to get election report')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to generate election report', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get voter report
 * GET /api/reports/voters
 */
const getVoterReport = async (req, res) => {
    try {
        const { electionId, schoolId, associationId, status, format } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('electionId is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!validateObjectId('electionId')(req, res, () => { })) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const filters = {}
        if (schoolId) filters.schoolId = schoolId
        if (associationId) filters.associationId = associationId
        if (status) filters.status = status

        const report = await reportService.generateVoterReport(electionId, filters)

        if (format === 'csv') {
            // Export as CSV
            const csv = reportService.exportToCSV(
                report.voters,
                ['voterId', 'fullName', 'email', 'phone', 'hasVoted', 'votedAt']
            )

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename=voter-report-${ electionId }-${ Date.now() }.csv`)
            return res.status(HTTP_STATUS.OK).send(csv)
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(report, 'Voter report generated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_voter_report_error',
            error: error.message,
            electionId: req.query.electionId
        }, 'Failed to get voter report')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to generate voter report', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get candidate report
 * GET /api/reports/candidates
 */
const getCandidateReport = async (req, res) => {
    try {
        const { electionId, format } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('electionId is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!validateObjectId('electionId')(req, res, () => { })) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const report = await reportService.generateCandidateReport(electionId)

        if (format === 'csv') {
            // Export as CSV
            const csv = reportService.exportToCSV(
                report.candidates,
                ['fullName', 'displayName', 'position', 'status', 'voteCount', 'percentage']
            )

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename=candidate-report-${ electionId }-${ Date.now() }.csv`)
            return res.status(HTTP_STATUS.OK).send(csv)
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(report, 'Candidate report generated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_candidate_report_error',
            error: error.message,
            electionId: req.query.electionId
        }, 'Failed to get candidate report')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to generate candidate report', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get statistics report
 * GET /api/reports/statistics
 */
const getStatisticsReport = async (req, res) => {
    try {
        const { startDate, endDate, schoolId, associationId } = req.query

        const filters = {}
        if (startDate) filters.startDate = startDate
        if (endDate) filters.endDate = endDate
        if (schoolId) filters.schoolId = schoolId
        if (associationId) filters.associationId = associationId

        const report = await reportService.generateStatisticsReport(filters)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(report, 'Statistics report generated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_statistics_report_error',
            error: error.message
        }, 'Failed to get statistics report')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to generate statistics report', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get turnout analysis
 * GET /api/reports/turnout
 */
const getTurnoutAnalysis = async (req, res) => {
    try {
        const { electionId } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('electionId is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (!validateObjectId('electionId')(req, res, () => { })) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Invalid election ID format', HTTP_STATUS.BAD_REQUEST)
            )
        }

        const analysis = await reportService.generateTurnoutAnalysis(electionId)

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(analysis, 'Turnout analysis generated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_turnout_analysis_error',
            error: error.message,
            electionId: req.query.electionId
        }, 'Failed to get turnout analysis')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to generate turnout analysis', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getElectionReport,
    getVoterReport,
    getCandidateReport,
    getStatisticsReport,
    getTurnoutAnalysis
}

