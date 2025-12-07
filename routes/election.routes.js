const express = require('express')
const electionController = require('../controllers/election/election.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreateElection, validateUpdateElection, validateElectionId } = require('../validators/electionValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Election routes
router.post('/', validateCreateElection, electionController.createElection)
router.get('/search', electionController.searchElections)
router.get('/my-elections', electionController.getMyElections)
router.get('/:electionId', validateElectionId, electionController.getElection)
router.put('/:electionId', validateUpdateElection, electionController.updateElection)

// Workflow routes (Admin/Election Manager only)
router.post('/:electionId/advance-phase', validateElectionId, electionController.advancePhase)
router.post('/:electionId/start-voting', validateElectionId, electionController.startVoting)
router.post('/:electionId/close-voting', validateElectionId, electionController.closeVoting)
router.post('/:electionId/complete', validateElectionId, electionController.completeElection)
router.post('/:electionId/send-provisional-results', validateElectionId, electionController.sendProvisionalResults)

module.exports = router

