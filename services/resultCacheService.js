const logger = require('../utils/logger')
const ElectionResult = require('../models/ElectionResult')
const Election = require('../models/Election')

// In-memory cache (can be replaced with Redis)
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Result Caching Service
 * Caches election results for faster retrieval
 */
class ResultCacheService {
    /**
     * Get cached result or calculate and cache
     * @param {string} electionId - Election ID
     * @returns {Promise<Object>} Election results
     */
    async getElectionResults(electionId) {
        try {
            // Check cache first
            const cacheKey = `election:${ electionId }:results`
            const cached = cache.get(cacheKey)

            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                logger.debug({ electionId, source: 'cache' }, 'Returning cached results')
                return cached.data
            }

            // Check database for stored results
            const storedResult = await ElectionResult.findOne({ electionId })
                .sort({ calculatedAt: -1 })

            if (storedResult && storedResult.isValid) {
                // Cache the stored result
                cache.set(cacheKey, {
                    data: storedResult.results,
                    timestamp: Date.now()
                })
                logger.debug({ electionId, source: 'database' }, 'Returning stored results')
                return storedResult.results
            }

            // Calculate results
            const results = await this.calculateResults(electionId)

            // Store in database
            await this.storeResults(electionId, results)

            // Cache results
            cache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            })

            logger.debug({ electionId, source: 'calculated' }, 'Calculated and cached results')
            return results
        } catch (error) {
            logger.error({
                type: 'result_cache_error',
                error: error.message,
                electionId
            }, 'Failed to get election results')
            throw error
        }
    }

    /**
     * Calculate election results
     * @param {string} electionId - Election ID
     * @returns {Promise<Object>} Calculated results
     */
    async calculateResults(electionId) {
        const Vote = require('../models/Vote')
        const Position = require('../models/Position')
        const Candidate = require('../models/Candidate')

        const election = await Election.findById(electionId)
        if (!election) {
            throw new Error('Election not found')
        }

        const positions = await Position.find({ electionId })
        const results = {
            electionId,
            electionTitle: election.title,
            totalVotes: 0,
            positions: []
        }

        for (const position of positions) {
            const candidates = await Candidate.find({ positionId: position._id })
            const positionResults = {
                positionId: position._id,
                positionTitle: position.title,
                totalVotes: 0,
                candidates: []
            }

            for (const candidate of candidates) {
                const voteCount = await Vote.countDocuments({
                    electionId,
                    positionId: position._id,
                    candidateId: candidate._id,
                    isAbstention: false
                })

                const abstentionCount = await Vote.countDocuments({
                    electionId,
                    positionId: position._id,
                    isAbstention: true
                })

                positionResults.totalVotes += voteCount
                positionResults.candidates.push({
                    candidateId: candidate._id,
                    candidateName: `${ candidate.firstname } ${ candidate.lastname }`,
                    votes: voteCount,
                    percentage: 0 // Will calculate after
                })
            }

            // Calculate percentages
            if (positionResults.totalVotes > 0) {
                positionResults.candidates.forEach(candidate => {
                    candidate.percentage = Math.round((candidate.votes / positionResults.totalVotes) * 100 * 100) / 100
                })
            }

            // Sort by votes (descending)
            positionResults.candidates.sort((a, b) => b.votes - a.votes)

            // Determine winners
            const maxWinners = position.maxWinners || 1
            positionResults.winners = positionResults.candidates
                .slice(0, maxWinners)
                .map(c => c.candidateId)

            results.totalVotes += positionResults.totalVotes
            results.positions.push(positionResults)
        }

        return results
    }

    /**
     * Store calculated results in database
     * @param {string} electionId - Election ID
     * @param {Object} results - Calculated results
     */
    async storeResults(electionId, results) {
        try {
            await ElectionResult.findOneAndUpdate(
                { electionId },
                {
                    electionId,
                    results,
                    calculatedAt: new Date(),
                    isValid: true
                },
                { upsert: true, new: true }
            )
        } catch (error) {
            logger.error({
                type: 'store_results_error',
                error: error.message,
                electionId
            }, 'Failed to store results')
        }
    }

    /**
     * Invalidate cache for an election
     * @param {string} electionId - Election ID
     */
    invalidateCache(electionId) {
        const cacheKey = `election:${ electionId }:results`
        cache.delete(cacheKey)
        logger.debug({ electionId }, 'Invalidated result cache')
    }

    /**
     * Clear all cached results
     */
    clearCache() {
        cache.clear()
        logger.info('Cleared all result caches')
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        return {
            size: cache.size,
            keys: Array.from(cache.keys())
        }
    }
}

module.exports = new ResultCacheService()

