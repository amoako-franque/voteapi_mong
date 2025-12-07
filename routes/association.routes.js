const express = require('express')
const associationController = require('../controllers/association/association.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreateAssociation, validateUpdateAssociation, validateAssociationId } = require('../validators/associationValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// Association routes
router.post('/', validateCreateAssociation, associationController.createAssociation)
router.get('/', associationController.getAssociations)
router.get('/:id', validateAssociationId, associationController.getAssociationById)
router.put('/:id', validateUpdateAssociation, associationController.updateAssociation)
router.delete('/:id', validateAssociationId, associationController.deleteAssociation)
router.post('/:id/verify', validateAssociationId, associationController.verifyAssociation)

module.exports = router

