const Election = require('../models/Election')
const Vote = require('../models/Vote')
const VoterRegistry = require('../models/VoterRegistry')
const Candidate = require('../models/Candidate')
const Position = require('../models/Position')
const ElectionResult = require('../models/ElectionResult')
const School = require('../models/School')
const Association = require('../models/Association')
const logger = require('../utils/logger')

class ReportService {
    /**
     * Generate election report
     */
    async generateElectionReport(electionId) {
        try {
            const election = await Election.findById(electionId)
                .populate('schoolId', 'name shortName code')
                .populate('associationId', 'name shortName code')
                .populate('createdBy', 'firstname lastname email')

            if (!election) {
                throw new Error('Election not found')
            }

            // Get positions
            const positions = await Position.find({ electionId })
            const positionIds = positions.map(p => p._id)

            // Get candidates
            const candidates = await Candidate.find({
                electionId,
                positionId: { $in: positionIds }
            }).populate('voterId', 'firstname lastname email')

            // Get votes
            const votes = await Vote.find({
                electionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            // Get voter registry
            const voters = await VoterRegistry.find({ electionId })

            // Get results if available
            const result = await ElectionResult.getElectionResult(electionId)

            // Calculate statistics
            const totalVoters = voters.length
            const totalVotes = votes.length
            const turnoutPercentage = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(2) : 0

            // Votes by position
            const votesByPosition = {}
            positions.forEach(position => {
                const positionVotes = votes.filter(v => v.positionId && v.positionId.toString() === position._id.toString())
                votesByPosition[position._id] = {
                    positionId: position._id,
                    positionTitle: position.title,
                    totalVotes: positionVotes.length,
                    candidates: []
                }

                // Votes by candidate
                const positionCandidates = candidates.filter(c => c.positionId && c.positionId.toString() === position._id.toString())
                positionCandidates.forEach(candidate => {
                    const candidateVotes = positionVotes.filter(v =>
                        v.candidateId && v.candidateId.toString() === candidate._id.toString()
                    )
                    votesByPosition[position._id].candidates.push({
                        candidateId: candidate._id,
                        candidateName: candidate.fullName,
                        voteCount: candidateVotes.length,
                        percentage: positionVotes.length > 0 ? ((candidateVotes.length / positionVotes.length) * 100).toFixed(2) : 0
                    })
                })
            })

            return {
                election: {
                    id: election._id,
                    title: election.title,
                    description: election.description,
                    scope: election.scope,
                    school: election.schoolId,
                    association: election.associationId,
                    status: election.status,
                    currentPhase: election.currentPhase,
                    startDateTime: election.startDateTime,
                    endDateTime: election.endDateTime,
                    createdBy: election.createdBy
                },
                statistics: {
                    totalPositions: positions.length,
                    totalCandidates: candidates.length,
                    totalVoters,
                    totalVotes,
                    turnoutPercentage: parseFloat(turnoutPercentage),
                    abstentions: votes.filter(v => v.isAbstention).length
                },
                positions: Object.values(votesByPosition),
                result: result || null,
                generatedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'generate_election_report_error',
                error: error.message,
                electionId
            }, 'Failed to generate election report')
            throw error
        }
    }

    /**
     * Generate voter participation report
     */
    async generateVoterReport(electionId, filters = {}) {
        try {
            const { schoolId, associationId, status } = filters

            const query = { electionId }
            if (schoolId) query.schoolId = schoolId
            if (associationId) query.associationId = associationId
            if (status) query.status = status

            const voters = await VoterRegistry.find(query)
                .populate('schoolId', 'name shortName')
                .populate('associationId', 'name shortName')

            const votes = await Vote.find({
                electionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            const votedVoterIds = new Set(votes.map(v => v.voterId?.toString()).filter(Boolean))
            const notVotedVoterIds = voters.filter(v => !votedVoterIds.has(v._id.toString())).map(v => v._id)

            const participationStats = {
                total: voters.length,
                voted: votedVoterIds.size,
                notVoted: notVotedVoterIds.length,
                participationRate: voters.length > 0 ? ((votedVoterIds.size / voters.length) * 100).toFixed(2) : 0
            }

            return {
                voters: voters.map(voter => ({
                    id: voter._id,
                    voterId: voter.voterId,
                    fullName: voter.fullName,
                    email: voter.email,
                    phone: voter.phone,
                    school: voter.schoolId,
                    association: voter.associationId,
                    status: voter.status,
                    hasVoted: votedVoterIds.has(voter._id.toString()),
                    votedAt: votes.find(v => v.voterId && v.voterId.toString() === voter._id.toString())?.createdAt || null
                })),
                statistics: participationStats,
                generatedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'generate_voter_report_error',
                error: error.message,
                electionId
            }, 'Failed to generate voter report')
            throw error
        }
    }

    /**
     * Generate candidate performance report
     */
    async generateCandidateReport(electionId) {
        try {
            const positions = await Position.find({ electionId })
            const candidates = await Candidate.find({ electionId })
                .populate('voterId', 'firstname lastname email')
                .populate('positionId', 'title')

            const votes = await Vote.find({
                electionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            const candidatePerformance = candidates.map(candidate => {
                const candidateVotes = votes.filter(v =>
                    v.candidateId && v.candidateId.toString() === candidate._id.toString()
                )
                const positionVotes = votes.filter(v =>
                    v.positionId && v.positionId.toString() === candidate.positionId?.toString()
                )

                return {
                    candidateId: candidate._id,
                    fullName: candidate.fullName,
                    displayName: candidate.displayName,
                    position: candidate.positionId,
                    status: candidate.status,
                    voteCount: candidateVotes.length,
                    totalPositionVotes: positionVotes.length,
                    percentage: positionVotes.length > 0 ? ((candidateVotes.length / positionVotes.length) * 100).toFixed(2) : 0,
                    nominationDate: candidate.createdAt,
                    approvalDate: candidate.approvedAt
                }
            })

            return {
                candidates: candidatePerformance,
                totalCandidates: candidates.length,
                totalPositions: positions.length,
                generatedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'generate_candidate_report_error',
                error: error.message,
                electionId
            }, 'Failed to generate candidate report')
            throw error
        }
    }

    /**
     * Generate statistics report
     */
    async generateStatisticsReport(filters = {}) {
        try {
            const { startDate, endDate, schoolId, associationId } = filters

            const query = {}
            if (startDate || endDate) {
                query.createdAt = {}
                if (startDate) query.createdAt.$gte = new Date(startDate)
                if (endDate) query.createdAt.$lte = new Date(endDate)
            }
            if (schoolId) query.schoolId = schoolId
            if (associationId) query.associationId = associationId

            const [elections, votes, voters, candidates] = await Promise.all([
                Election.find(query),
                Vote.find({ electionId: { $in: (await Election.find(query).select('_id')).map(e => e._id) } }),
                VoterRegistry.find(query),
                Candidate.find({ electionId: { $in: (await Election.find(query).select('_id')).map(e => e._id) } })
            ])

            const electionStats = {
                total: elections.length,
                byStatus: {},
                byScope: {},
                byPhase: {}
            }

            elections.forEach(election => {
                electionStats.byStatus[election.status] = (electionStats.byStatus[election.status] || 0) + 1
                electionStats.byScope[election.scope] = (electionStats.byScope[election.scope] || 0) + 1
                electionStats.byPhase[election.currentPhase] = (electionStats.byPhase[election.currentPhase] || 0) + 1
            })

            return {
                elections: electionStats,
                votes: {
                    total: votes.length,
                    byStatus: {}
                },
                voters: {
                    total: voters.length,
                    byStatus: {}
                },
                candidates: {
                    total: candidates.length,
                    byStatus: {}
                },
                generatedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'generate_statistics_report_error',
                error: error.message
            }, 'Failed to generate statistics report')
            throw error
        }
    }

    /**
     * Export report as CSV
     */
    exportToCSV(data, headers) {
        const csvRows = []

        // Add headers
        csvRows.push(headers.join(','))

        // Add data rows
        if (Array.isArray(data)) {
            data.forEach(row => {
                const values = headers.map(header => {
                    const value = row[header] || ''
                    // Escape commas and quotes
                    return `"${ String(value).replace(/"/g, '""') }"`
                })
                csvRows.push(values.join(','))
            })
        }

        return csvRows.join('\n')
    }

    /**
     * Generate turnout analysis
     */
    async generateTurnoutAnalysis(electionId) {
        try {
            const election = await Election.findById(electionId)
            if (!election) {
                throw new Error('Election not found')
            }

            const voters = await VoterRegistry.find({ electionId })
            const votes = await Vote.find({
                electionId,
                status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
            })

            // Group by time periods
            const votesByHour = {}
            votes.forEach(vote => {
                const hour = new Date(vote.createdAt).getHours()
                votesByHour[hour] = (votesByHour[hour] || 0) + 1
            })

            const totalVoters = voters.length
            const totalVotes = votes.length
            const turnoutPercentage = totalVoters > 0 ? ((totalVotes / totalVoters) * 100).toFixed(2) : 0

            return {
                electionId: election._id,
                electionTitle: election.title,
                totalVoters,
                totalVotes,
                turnoutPercentage: parseFloat(turnoutPercentage),
                votesByHour,
                peakVotingHour: Object.keys(votesByHour).reduce((a, b) => votesByHour[a] > votesByHour[b] ? a : b, null),
                generatedAt: new Date()
            }
        } catch (error) {
            logger.error({
                type: 'generate_turnout_analysis_error',
                error: error.message,
                electionId
            }, 'Failed to generate turnout analysis')
            throw error
        }
    }
}

module.exports = new ReportService()

