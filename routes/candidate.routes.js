const express = require('express')
const candidateController = require('../controllers/candidate/candidate.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreateCandidate, validateElectionAndPositionIds, validateCandidateId } = require('../validators/candidateValidators')
const fileUploadService = require('../services/fileUploadService')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Candidate routes (nested under elections and positions)
router.post('/elections/:electionId/positions/:positionId/candidates',
    fileUploadService.getImageUpload().single('profileImage'),
    validateCreateCandidate,
    candidateController.addCandidate
)
router.get('/elections/:electionId/positions/:positionId/candidates', validateElectionAndPositionIds, candidateController.getPositionCandidates)
router.get('/elections/:electionId/candidates', validateElectionAndPositionIds, candidateController.getElectionCandidates)
router.delete('/candidates/:candidateId', validateCandidateId, candidateController.removeCandidate)

// Profile image routes
router.put('/candidates/:candidateId/profile-image',
    validateCandidateId,
    fileUploadService.getImageUpload().single('profileImage'),
    candidateController.updateCandidateProfileImage
)
router.delete('/candidates/:candidateId/profile-image',
    validateCandidateId,
    candidateController.deleteCandidateProfileImage
)

module.exports = router

