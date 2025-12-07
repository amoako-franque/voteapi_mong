const mongoose = require('mongoose')
const Vote = require('../../models/Vote')
const Election = require('../../models/Election')
const Position = require('../../models/Position')
const Candidate = require('../../models/Candidate')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const PDFDocument = require('pdfkit')

/**
 * Calculate and get election results
 * GET /api/results/election/:electionId
 */
const getElectionResults = async (req, res) => {
    try {
        const { electionId } = req.params

        // Find election
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Get all positions for this election
        const positions = await Position.find({ electionId }).sort({ orderIndex: 1 })

        // Calculate results for each position
        const results = await Promise.all(
            positions.map(async (position) => {
                return await calculatePositionResults(electionId, position._id)
            })
        )

        // Calculate overall statistics
        const totalVotes = await Vote.countDocuments({
            electionId,
            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
        })

        const verifiedVotes = await Vote.countDocuments({
            electionId,
            verified: true
        })

        const totalEligibleVoters = election.statistics?.totalEligibleVoters || 0
        const turnoutPercentage = totalEligibleVoters > 0
            ? ((totalVotes / totalEligibleVoters) * 100).toFixed(2)
            : 0

        logger.info({
            type: 'election_results_retrieved',
            electionId,
            totalVotes,
            positionsCount: positions.length
        }, 'Election results retrieved successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                election: {
                    id: election._id,
                    title: election.title,
                    status: election.status,
                    currentPhase: election.currentPhase
                },
                statistics: {
                    totalVotes,
                    verifiedVotes,
                    totalEligibleVoters,
                    turnoutPercentage: parseFloat(turnoutPercentage),
                    positionsCount: positions.length
                },
                results,
                calculatedAt: new Date()
            }, 'Election results retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_election_results_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to get election results')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to get election results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Calculate results for a specific position
 */
async function calculatePositionResults(electionId, positionId) {
    try {
        const position = await Position.findById(positionId)
        if (!position) {
            throw new Error('Position not found')
        }

        // Get all candidates for this position
        const candidates = await Candidate.find({
            positionId,
            electionId,
            status: 'APPROVED'
        })

        // Get vote counts for each candidate
        const voteCounts = await Vote.aggregate([
            {
                $match: {
                    electionId: mongoose.Types.ObjectId(electionId),
                    positionId: mongoose.Types.ObjectId(positionId),
                    status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] },
                    isAbstention: false
                }
            },
            {
                $group: {
                    _id: '$candidateId',
                    totalVotes: { $sum: 1 },
                    verifiedVotes: {
                        $sum: { $cond: ['$verified', 1, 0] }
                    }
                }
            },
            {
                $sort: { totalVotes: -1 }
            }
        ])

        // Get abstention count
        const abstentionCount = await Vote.countDocuments({
            electionId,
            positionId,
            isAbstention: true,
            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
        })

        // Calculate total votes for this position
        const totalPositionVotes = voteCounts.reduce((sum, vc) => sum + vc.totalVotes, 0) + abstentionCount

        // Map candidates with vote counts
        const candidateResults = candidates.map(candidate => {
            const voteCount = voteCounts.find(vc => vc._id.toString() === candidate._id.toString())
            const votes = voteCount?.totalVotes || 0
            const percentage = totalPositionVotes > 0 ? ((votes / totalPositionVotes) * 100).toFixed(2) : 0

            return {
                candidateId: candidate._id,
                candidateName: candidate.fullName,
                displayName: candidate.displayName,
                votes,
                verifiedVotes: voteCount?.verifiedVotes || 0,
                percentage: parseFloat(percentage),
                rank: 0 // Will be set after sorting
            }
        })

        // Sort by votes and assign ranks
        candidateResults.sort((a, b) => b.votes - a.votes)
        candidateResults.forEach((result, index) => {
            result.rank = index + 1
        })

        // Determine winner(s)
        const winners = candidateResults.filter(cr => cr.rank === 1 && cr.votes > 0)
        const maxWinners = position.maxWinners || 1
        const actualWinners = winners.slice(0, maxWinners)

        return {
            positionId: position._id,
            positionTitle: position.title,
            totalVotes: totalPositionVotes,
            abstentions: abstentionCount,
            candidates: candidateResults,
            winners: actualWinners.map(w => ({
                candidateId: w.candidateId,
                candidateName: w.candidateName,
                votes: w.votes,
                percentage: w.percentage
            })),
            calculatedAt: new Date()
        }
    } catch (error) {
        logger.error({
            type: 'calculate_position_results_error',
            error: error.message,
            electionId,
            positionId
        }, 'Failed to calculate position results')
        throw error
    }
}

/**
 * Calculate and update election results
 * POST /api/results/calculate
 */
const calculateResults = async (req, res) => {
    try {
        const { electionId } = req.body

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Find election
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if election is in results phase or completed
        if (election.currentPhase !== 'RESULTS' && election.status !== 'COMPLETED') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election must be in RESULTS phase or COMPLETED status to calculate results', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get all positions
        const positions = await Position.find({ electionId }).sort({ orderIndex: 1 })

        // Calculate results for each position
        const results = await Promise.all(
            positions.map(async (position) => {
                return await calculatePositionResults(electionId, position._id)
            })
        )

        // Update election statistics
        const totalVotes = await Vote.countDocuments({
            electionId,
            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
        })

        election.statistics.totalVotesCast = totalVotes
        election.statistics.turnoutPercentage = election.statistics.totalEligibleVoters > 0
            ? ((totalVotes / election.statistics.totalEligibleVoters) * 100).toFixed(2)
            : 0
        election.statistics.lastCalculatedAt = new Date()
        await election.save()

        logger.info({
            type: 'results_calculated',
            electionId,
            totalVotes,
            positionsCount: positions.length
        }, 'Election results calculated successfully')

        // Emit real-time results update
        if (req.app.get('io')) {
            req.app.get('io').emit('results:updated', {
                electionId: electionId.toString(),
                results,
                timestamp: new Date()
            })
        }

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                electionId,
                results,
                statistics: election.statistics,
                calculatedAt: new Date()
            }, 'Results calculated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'calculate_results_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to calculate results')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to calculate results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Verify results integrity
 * GET /api/results/verify
 */
const verifyResults = async (req, res) => {
    try {
        const { electionId } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get all votes
        const votes = await Vote.find({
            electionId,
            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
        })

        // Check for duplicate votes
        const duplicateVotes = await Vote.aggregate([
            {
                $match: {
                    electionId: mongoose.Types.ObjectId(electionId),
                    status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
                }
            },
            {
                $group: {
                    _id: {
                        electionId: '$electionId',
                        voterId: '$voterId',
                        positionId: '$positionId'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ])

        // Check for unverified votes
        const unverifiedVotes = votes.filter(v => !v.verified).length

        // Check for disputed votes
        const disputedVotes = votes.filter(v => v.disputeStatus !== 'NONE').length

        const verification = {
            electionId,
            totalVotes: votes.length,
            verifiedVotes: votes.filter(v => v.verified).length,
            unverifiedVotes,
            disputedVotes,
            duplicateVotes: duplicateVotes.length,
            integrity: {
                hasDuplicates: duplicateVotes.length > 0,
                hasUnverified: unverifiedVotes > 0,
                hasDisputes: disputedVotes > 0,
                isIntegrityValid: duplicateVotes.length === 0 && disputedVotes === 0
            },
            verifiedAt: new Date()
        }

        logger.info({
            type: 'results_verified',
            electionId,
            verification
        }, 'Results verification completed')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(verification, 'Results verification completed')
        )
    } catch (error) {
        logger.error({
            type: 'verify_results_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to verify results')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to verify results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Export results as CSV
 * GET /api/results/export
 */
const exportResults = async (req, res) => {
    try {
        const { electionId, format = 'csv' } = req.query

        if (!electionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Election ID is required', HTTP_STATUS.BAD_REQUEST)
            )
        }

        if (format !== 'csv' && format !== 'pdf') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Only CSV and PDF formats are supported', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Get election results
        const election = await Election.findById(electionId)
        if (!election) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Election not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        const positions = await Position.find({ electionId }).sort({ orderIndex: 1 })
        const positionResults = await Promise.all(
            positions.map(async (position) => {
                return await calculatePositionResults(electionId, position._id)
            })
        )

        // Calculate statistics
        const totalVotes = await Vote.countDocuments({
            electionId,
            status: { $in: ['CAST', 'VERIFIED', 'COUNTED'] }
        })
        const verifiedVotes = await Vote.countDocuments({
            electionId,
            verified: true
        })
        const totalEligibleVoters = election.statistics?.totalEligibleVoters || 0
        const turnoutPercentage = totalEligibleVoters > 0
            ? ((totalVotes / totalEligibleVoters) * 100).toFixed(2)
            : 0

        const statistics = {
            totalVotes,
            verifiedVotes,
            totalEligibleVoters,
            turnoutPercentage: parseFloat(turnoutPercentage)
        }

        if (format === 'pdf') {
            // Generate PDF
            const doc = new PDFDocument({ margin: 50 })
            const filename = `election-results-${ electionId }-${ Date.now() }.pdf`

            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', `attachment; filename="${ filename }"`)
            doc.pipe(res)

            // Header
            doc.fontSize(20).text('Election Results', { align: 'center' })
            doc.moveDown()
            doc.fontSize(14).text(election.title, { align: 'center' })
            doc.fontSize(10).text(`Generated: ${ new Date().toLocaleString() }`, { align: 'center' })
            doc.moveDown(2)

            // Statistics
            doc.fontSize(12).text('Overall Statistics', { underline: true })
            doc.fontSize(10)
            doc.text(`Total Votes: ${ statistics.totalVotes }`)
            doc.text(`Verified Votes: ${ statistics.verifiedVotes }`)
            doc.text(`Total Eligible Voters: ${ statistics.totalEligibleVoters }`)
            doc.text(`Turnout: ${ statistics.turnoutPercentage }%`)
            doc.moveDown(2)

            // Position Results
            positionResults.forEach((positionResult, index) => {
                if (index > 0) {
                    doc.addPage()
                }

                doc.fontSize(14).text(`Position ${ index + 1 }: ${ positionResult.positionTitle }`, { underline: true })
                doc.moveDown()

                // Table header
                doc.fontSize(10)
                const tableTop = doc.y
                const col1 = 50
                const col2 = 300
                const col3 = 400
                const col4 = 480

                doc.text('Rank', col1, tableTop, { underline: true })
                doc.text('Candidate', col2, tableTop, { underline: true })
                doc.text('Votes', col3, tableTop, { underline: true })
                doc.text('Percentage', col4, tableTop, { underline: true })

                let yPos = tableTop + 20

                // Table rows
                positionResult.candidates.forEach(candidate => {
                    if (yPos > 700) {
                        doc.addPage()
                        yPos = 50
                    }

                    doc.text(`${ candidate.rank }`, col1, yPos)
                    doc.text(candidate.candidateName, col2, yPos, { width: 90 })
                    doc.text(`${ candidate.votes }`, col3, yPos)
                    doc.text(`${ candidate.percentage }%`, col4, yPos)
                    yPos += 20
                })

                doc.moveDown()
                doc.text(`Abstentions: ${ positionResult.abstentions }`)
                doc.text(`Total Votes: ${ positionResult.totalVotes }`)
            })

            // Footer on last page
            doc.fontSize(8).text(
                `This is an official election results document. Generated on ${ new Date().toLocaleString() }`,
                { align: 'center' }
            )

            doc.end()
        } else {
            // Generate CSV
            let csv = 'Election Results\n'
            csv += `Election: ${ election.title }\n`
            csv += `Date: ${ new Date().toISOString() }\n\n`

            positionResults.forEach((positionResult, index) => {
                csv += `Position ${ index + 1 }: ${ positionResult.positionTitle }\n`
                csv += 'Candidate,Votes,Percentage,Rank\n'
                positionResult.candidates.forEach(candidate => {
                    csv += `"${ candidate.candidateName }",${ candidate.votes },${ candidate.percentage }%,${ candidate.rank }\n`
                })
                csv += `Abstentions: ${ positionResult.abstentions }\n`
                csv += `Total Votes: ${ positionResult.totalVotes }\n\n`
            })

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="election-results-${ electionId }-${ Date.now() }.csv"`)
            res.send(csv)
        }
    } catch (error) {
        logger.error({
            type: 'export_results_error',
            error: error.message,
            stack: error.stack
        }, 'Failed to export results')

        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error(error.message || 'Failed to export results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    getElectionResults,
    calculateResults,
    verifyResults,
    exportResults
}

