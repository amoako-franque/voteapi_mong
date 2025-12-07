const express = require('express')
const voterController = require('../controllers/voter/voter.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreateVoter, validateBulkCreateVoters, validateGetVoters, validateElectionIdForEligibleVoters } = require('../validators/voterValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Voter routes - voters are added to schools/organizations, not elections
router.post('/voters', validateCreateVoter, voterController.addVoter)
router.post('/voters/bulk', validateBulkCreateVoters, voterController.bulkAddVoters)
router.get('/voters', validateGetVoters, voterController.getVoters)

// Get eligible voters for a specific election (based on their school/org/department membership)
router.get('/elections/:electionId/eligible-voters', validateElectionIdForEligibleVoters, voterController.getEligibleVotersForElection)

module.exports = router

