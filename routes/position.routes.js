const express = require('express')
const positionController = require('../controllers/position/position.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreatePosition, validateUpdatePosition, validateElectionIdForPositions, validatePositionId } = require('../validators/positionValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Position routes (nested under elections)
router.post('/elections/:electionId/positions', validateCreatePosition, positionController.createPosition)
router.get('/elections/:electionId/positions', validateElectionIdForPositions, positionController.getElectionPositions)
router.put('/positions/:positionId', validateUpdatePosition, positionController.updatePosition)
router.delete('/positions/:positionId', validatePositionId, positionController.deletePosition)

module.exports = router

