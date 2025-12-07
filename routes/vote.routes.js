const express = require('express')
const voteController = require('../controllers/vote/vote.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateVoteSubmission, validateSecretCodeValidation, validateVoteId, validateGetVotesQuery, validateVoteVerification } = require('../validators/voteValidators')
const { validate } = require('../validators/commonValidators')
const rateLimit = require('express-rate-limit')

const router = express.Router()

const voteSubmissionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Too many vote submissions',
        message: 'Too many vote submissions from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
})

const secretCodeValidationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: 'Too many validation attempts',
        message: 'Too many secret code validation attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
})

/**
 * Public routes (no auth required for validation)
 */

// Validate secret code before voting
// POST /api/votes/validate
router.post(
    '/validate',
    secretCodeValidationLimiter,
    validateSecretCodeValidation,
    validate,
    voteController.validateSecretCode
)

/**
 * Protected routes (auth required)
 */

// Submit a vote
// POST /api/votes
router.post(
    '/',
    voteSubmissionLimiter,
    authMiddleware,
    validateVoteSubmission,
    validate,
    voteController.submitVote
)

// Get votes (Admin only - check permissions in controller if needed)
// GET /api/votes
router.get(
    '/',
    authMiddleware,
    validateGetVotesQuery,
    validate,
    voteController.getVotes
)

// Get vote by ID
// GET /api/votes/:id
router.get(
    '/:id',
    authMiddleware,
    validateVoteId,
    validate,
    voteController.getVoteById
)

// Verify a vote (Admin only)
// POST /api/votes/:id/verify
router.post(
    '/:id/verify',
    authMiddleware,
    validateVoteId,
    validateVoteVerification,
    validate,
    voteController.verifyVote
)

module.exports = router

