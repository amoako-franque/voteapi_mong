const express = require('express')
const pollController = require('../controllers/poll/poll.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreatePoll, validateUpdatePoll, validateVotePoll, validatePollId, validatePagination } = require('../validators/pollValidators')
const { validate } = require('../validators/commonValidators')

const router = express.Router()

// Public routes (no auth required)
// GET /api/polls - Get all public polls
router.get('/', validatePagination, validate, pollController.getPolls)

// GET /api/polls/:pollId - Get a single poll
router.get('/:pollId', validatePollId, validate, pollController.getPoll)

// GET /api/polls/:pollId/results - Get poll results
router.get('/:pollId/results', validatePollId, validate, pollController.getPollResults)

// POST /api/polls/:pollId/vote - Vote on a poll (can be anonymous)
router.post('/:pollId/vote', validatePollId, validateVotePoll, validate, pollController.votePoll)

// Protected routes (auth optional but provides extra features)
// POST /api/polls - Create a poll (auth optional)
router.post('/', validateCreatePoll, validate, pollController.createPoll)

// PUT /api/polls/:pollId - Update a poll (auth required - only creator)
router.put('/:pollId', authMiddleware, validatePollId, validateUpdatePoll, validate, pollController.updatePoll)

// DELETE /api/polls/:pollId - Delete a poll (auth required - only creator)
router.delete('/:pollId', authMiddleware, validatePollId, validate, pollController.deletePoll)

// GET /api/polls/my-polls - Get user's polls (auth required)
router.get('/my-polls', authMiddleware, validatePagination, validate, pollController.getMyPolls)

module.exports = router

