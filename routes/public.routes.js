const express = require('express')
const router = express.Router()
const publicController = require('../controllers/public/public.controller')
const { validateObjectId, validate } = require('../validators/commonValidators')


// GET /api/public/elections
router.get('/elections', publicController.getPublicElections)

// GET /api/public/elections/:id
router.get('/elections/:id', validateObjectId('id'), validate, publicController.getPublicElection)

// GET /api/public/elections/:id/candidates
router.get('/elections/:id/candidates', validateObjectId('id'), validate, publicController.getPublicCandidates)

// GET /api/public/elections/:id/positions
router.get('/elections/:id/positions', validateObjectId('id'), validate, publicController.getPublicPositions)

// GET /api/public/results/:electionId
router.get('/results/:electionId', validateObjectId('electionId'), validate, publicController.getPublicResults)

module.exports = router

