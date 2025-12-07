const express = require('express')
const schoolController = require('../controllers/school/school.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validateCreateSchool, validateUpdateSchool, validateSchoolId } = require('../validators/schoolValidators')

const router = express.Router()

// All routes require authentication
router.use(authMiddleware)

// School routes
router.post('/', validateCreateSchool, schoolController.createSchool)
router.get('/', schoolController.getSchools)
router.get('/:id', validateSchoolId, schoolController.getSchoolById)
router.put('/:id', validateUpdateSchool, schoolController.updateSchool)
router.delete('/:id', validateSchoolId, schoolController.deleteSchool)
router.post('/:id/verify', validateSchoolId, schoolController.verifySchool)

module.exports = router

