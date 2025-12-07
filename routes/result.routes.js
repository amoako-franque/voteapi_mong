const express = require('express')
const resultController = require('../controllers/result/result.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateObjectId, validateObjectIdQuery, validate } = require('../validators/commonValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Get election results
// GET /api/results/election/:electionId
router.get(
    '/election/:electionId',
    validateObjectId('electionId'),
    validate,
    resultController.getElectionResults
)

// Calculate results
// POST /api/results/calculate
router.post(
    '/calculate',
    resultController.calculateResults
)

// Verify results integrity
// GET /api/results/verify
router.get(
    '/verify',
    validateObjectIdQuery('electionId', true),
    validate,
    resultController.verifyResults
)

// Export results
// GET /api/results/export
router.get(
    '/export',
    validateObjectIdQuery('electionId', true),
    validate,
    resultController.exportResults
)

module.exports = router

