const Poll = require('../../models/Poll')
const PollVote = require('../../models/PollVote')
const User = require('../../models/User')
const logger = require('../../utils/logger')
const responseFormatter = require('../../utils/responseFormatter')
const HTTP_STATUS = require('../../utils/constants').HTTP_STATUS
const emailService = require('../../services/emailService')
const notificationService = require('../../services/notificationService')

/**
 * Create a new poll
 * POST /api/polls
 * Can be created by registered users or anonymous users
 */
const createPoll = async (req, res) => {
    try {
        const {
            title,
            description,
            pollType,
            category,
            subject,
            options,
            ratingOptions,
            startDate,
            endDate,
            visibility,
            settings,
            tags,
            creatorEmail,
            creatorName
        } = req.body

        const userId = req.user?._id || null
        const isAnonymous = !userId

        // Build poll data
        const pollData = {
            title,
            description,
            pollType: pollType || 'RATING',
            category: category || 'OTHER',
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: new Date(endDate),
            visibility: visibility || 'PUBLIC',
            settings: {
                allowMultipleVotes: settings?.allowMultipleVotes || false,
                requireRegistration: settings?.requireRegistration || false,
                showResultsBeforeEnd: settings?.showResultsBeforeEnd || false,
                allowComments: settings?.allowComments !== false,
                sendResultsToVoters: settings?.sendResultsToVoters !== false,
                sendResultsToCreator: settings?.sendResultsToCreator !== false,
                ...settings
            },
            tags: tags || [],
            createdBy: userId,
            isAnonymousCreator: isAnonymous,
            status: 'DRAFT'
        }

        // Add poll type specific data
        if (pollType === 'COMPARISON') {
            // For comparison polls, add options
            if (!options || options.length < 2) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Comparison polls require at least 2 options', HTTP_STATUS.BAD_REQUEST)
                )
            }
            // Ensure each option has an id
            pollData.options = options.map((option, index) => ({
                ...option,
                id: option.id || `option_${ index + 1 }_${ Date.now() }`,
                order: option.order || index
            }))
        } else {
            // For rating polls, add subject and ratingOptions
            pollData.subject = subject
            pollData.ratingOptions = ratingOptions || {
                type: 'STARS',
                minValue: 1,
                maxValue: 5
            }
        }

        // Add creator info for anonymous users
        if (isAnonymous) {
            pollData.creatorEmail = creatorEmail
            pollData.creatorName = creatorName
        }

        // Create poll
        const poll = await Poll.create(pollData)

        // Update user stats if registered
        if (userId) {
            await User.findByIdAndUpdate(userId, {
                $inc: { 'pollStats.pollsCreated': 1 },
                $set: { 'pollStats.lastPollCreatedAt': new Date() }
            })
        }

        logger.info({
            type: 'poll_created',
            pollId: poll._id,
            userId: userId || 'anonymous',
            category: poll.category
        }, 'Poll created successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created(poll, 'Poll created successfully')
        )
    } catch (error) {
        logger.error({
            type: 'poll_creation_error',
            error: error.message,
            stack: error.stack
        }, 'Error creating poll')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to create poll', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get all polls (public)
 * GET /api/polls
 */
const getPolls = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            status,
            visibility = 'PUBLIC',
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query

        const query = {}

        // Only show public polls unless user is authenticated and owns them
        if (req.user) {
            // Authenticated users can see their own polls regardless of visibility
            query.$or = [
                { visibility: 'PUBLIC' },
                { visibility: 'UNLISTED' },
                { createdBy: req.user._id }
            ]
        } else {
            query.visibility = 'PUBLIC'
        }

        // Filter by category
        if (category) {
            query.category = category
        }

        // Filter by status
        if (status) {
            query.status = status
        } else {
            // Default: show active and upcoming polls
            query.status = { $in: ['DRAFT', 'ACTIVE'] }
        }

        // Search
        if (search) {
            query.$or = [
                ...(query.$or || []),
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { 'subject.name': { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ]
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 }

        const [polls, total] = await Promise.all([
            Poll.find(query)
                .select('-statistics.ratingDistribution')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('createdBy', 'firstname lastname email')
                .lean(),
            Poll.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                polls,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Polls retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_polls_error',
            error: error.message
        }, 'Error retrieving polls')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to retrieve polls', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get a single poll
 * GET /api/polls/:pollId
 */
const getPoll = async (req, res) => {
    try {
        const { pollId } = req.params

        const poll = await Poll.findById(pollId)
            .populate('createdBy', 'firstname lastname email')

        if (!poll) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Poll not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check visibility
        if (poll.visibility === 'PRIVATE' && (!req.user || poll.createdBy?._id?.toString() !== req.user._id.toString())) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Poll is private', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Increment views
        await Poll.findByIdAndUpdate(pollId, { $inc: { views: 1 } })

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(poll, 'Poll retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_poll_error',
            error: error.message,
            pollId: req.params.pollId
        }, 'Error retrieving poll')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to retrieve poll', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Update a poll
 * PUT /api/polls/:pollId
 * Only creator can update
 */
const updatePoll = async (req, res) => {
    try {
        const { pollId } = req.params
        const updateData = req.body

        const poll = await Poll.findById(pollId)

        if (!poll) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Poll not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if user is creator
        if (!req.user || poll.createdBy?.toString() !== req.user._id.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the poll creator can update it', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Don't allow updating if poll has ended
        if (poll.status === 'ENDED') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Cannot update ended poll', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Update poll
        Object.assign(poll, updateData)
        await poll.save()

        logger.info({
            type: 'poll_updated',
            pollId: poll._id,
            userId: req.user._id
        }, 'Poll updated successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(poll, 'Poll updated successfully')
        )
    } catch (error) {
        logger.error({
            type: 'poll_update_error',
            error: error.message,
            pollId: req.params.pollId
        }, 'Error updating poll')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to update poll', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Delete a poll
 * DELETE /api/polls/:pollId
 * Only creator can delete
 */
const deletePoll = async (req, res) => {
    try {
        const { pollId } = req.params

        const poll = await Poll.findById(pollId)

        if (!poll) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Poll not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if user is creator
        if (!req.user || poll.createdBy?.toString() !== req.user._id.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Only the poll creator can delete it', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Delete poll and all votes
        await Promise.all([
            Poll.findByIdAndDelete(pollId),
            PollVote.deleteMany({ pollId })
        ])

        logger.info({
            type: 'poll_deleted',
            pollId: poll._id,
            userId: req.user._id
        }, 'Poll deleted successfully')

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(null, 'Poll deleted successfully')
        )
    } catch (error) {
        logger.error({
            type: 'poll_delete_error',
            error: error.message,
            pollId: req.params.pollId
        }, 'Error deleting poll')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to delete poll', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Vote on a poll
 * POST /api/polls/:pollId/vote
 * Can be done by registered or anonymous users
 */
const votePoll = async (req, res) => {
    try {
        const { pollId } = req.params
        const { rating, selectedOptionId, comment, voterEmail, voterName } = req.body

        const poll = await Poll.findById(pollId)

        if (!poll) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Poll not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if poll is active
        if (!poll.canVote()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(
                responseFormatter.error('Poll is not currently accepting votes', HTTP_STATUS.BAD_REQUEST)
            )
        }

        // Check if registration is required
        if (poll.settings.requireRegistration && !req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                responseFormatter.error('This poll requires registration to vote', HTTP_STATUS.UNAUTHORIZED)
            )
        }

        // Validate based on poll type
        if (poll.pollType === 'RATING') {
            // Validate rating for rating polls
            if (!rating) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Rating is required for rating polls', HTTP_STATUS.BAD_REQUEST)
                )
            }
            const minRating = poll.ratingOptions?.minValue || 1
            const maxRating = poll.ratingOptions?.maxValue || 5
            if (rating < minRating || rating > maxRating) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error(`Rating must be between ${ minRating } and ${ maxRating }`, HTTP_STATUS.BAD_REQUEST)
                )
            }
        } else if (poll.pollType === 'COMPARISON') {
            // Validate selected option for comparison polls
            if (!selectedOptionId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Selected option is required for comparison polls', HTTP_STATUS.BAD_REQUEST)
                )
            }
            // Check if option exists
            const optionExists = poll.options.some(opt => opt.id === selectedOptionId)
            if (!optionExists) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(
                    responseFormatter.error('Invalid option selected', HTTP_STATUS.BAD_REQUEST)
                )
            }
        }

        const userId = req.user?._id || null
        const ipAddress = req.ip || req.connection.remoteAddress
        const userAgent = req.headers['user-agent']

        // Check if user already voted (if multiple votes not allowed)
        if (!poll.settings.allowMultipleVotes) {
            const existingVote = await PollVote.findOne({
                pollId,
                $or: [
                    { userId: userId },
                    { ipAddress, userId: null }
                ]
            })

            if (existingVote) {
                return res.status(HTTP_STATUS.CONFLICT).json(
                    responseFormatter.error('You have already voted on this poll', HTTP_STATUS.CONFLICT)
                )
            }
        }

        // Create vote
        const voteData = {
            pollId,
            userId,
            voterEmail: voterEmail || (req.user?.email),
            voterName: voterName || (req.user ? `${ req.user.firstname } ${ req.user.lastname }` : null),
            isAnonymous: !userId,
            comment,
            ipAddress,
            userAgent,
            verified: !!userId
        }

        // Add rating or selectedOptionId based on poll type
        if (poll.pollType === 'RATING') {
            voteData.rating = rating
        } else if (poll.pollType === 'COMPARISON') {
            voteData.selectedOptionId = selectedOptionId
        }

        const vote = await PollVote.create(voteData)

        // Update poll statistics
        await poll.updateStatistics()

        // Update user stats if registered
        if (userId) {
            await User.findByIdAndUpdate(userId, {
                $inc: { 'pollStats.pollsVoted': 1 }
            })
        }

        logger.info({
            type: 'poll_vote_created',
            pollId: poll._id,
            voteId: vote._id,
            userId: userId || 'anonymous',
            pollType: poll.pollType
        }, 'Vote cast successfully')

        return res.status(HTTP_STATUS.CREATED).json(
            responseFormatter.created(vote, 'Vote cast successfully')
        )
    } catch (error) {
        logger.error({
            type: 'poll_vote_error',
            error: error.message,
            pollId: req.params.pollId
        }, 'Error casting vote')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to cast vote', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get poll results
 * GET /api/polls/:pollId/results
 */
const getPollResults = async (req, res) => {
    try {
        const { pollId } = req.params

        const poll = await Poll.findById(pollId)

        if (!poll) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                responseFormatter.error('Poll not found', HTTP_STATUS.NOT_FOUND)
            )
        }

        // Check if results can be shown
        if (!poll.settings.showResultsBeforeEnd && !poll.hasEnded && (!req.user || poll.createdBy?.toString() !== req.user._id.toString())) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(
                responseFormatter.error('Results are not available until the poll ends', HTTP_STATUS.FORBIDDEN)
            )
        }

        // Get results
        const results = await poll.getResults()

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success(results, 'Poll results retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_poll_results_error',
            error: error.message,
            pollId: req.params.pollId
        }, 'Error retrieving poll results')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to retrieve poll results', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

/**
 * Get user's polls
 * GET /api/polls/my-polls
 * Only for registered users
 */
const getMyPolls = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(
                responseFormatter.error('Authentication required', HTTP_STATUS.UNAUTHORIZED)
            )
        }

        const {
            page = 1,
            limit = 20,
            status
        } = req.query

        const query = { createdBy: req.user._id }
        if (status) {
            query.status = status
        }

        const skip = (parseInt(page) - 1) * parseInt(limit)

        const [polls, total] = await Promise.all([
            Poll.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Poll.countDocuments(query)
        ])

        return res.status(HTTP_STATUS.OK).json(
            responseFormatter.success({
                polls,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }, 'Polls retrieved successfully')
        )
    } catch (error) {
        logger.error({
            type: 'get_my_polls_error',
            error: error.message,
            userId: req.user?._id
        }, 'Error retrieving user polls')
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
            responseFormatter.error('Failed to retrieve polls', HTTP_STATUS.INTERNAL_SERVER_ERROR)
        )
    }
}

module.exports = {
    createPoll,
    getPolls,
    getPoll,
    updatePoll,
    deletePoll,
    votePoll,
    getPollResults,
    getMyPolls
}

