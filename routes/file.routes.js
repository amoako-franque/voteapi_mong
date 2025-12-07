const express = require('express')
const router = express.Router()
const fileController = require('../controllers/file/file.controller')
const { authMiddleware } = require('../middleware/authMiddleware')
const fileUploadService = require('../services/fileUploadService')

// All routes require authentication
router.use(authMiddleware)

// Upload routes
// POST /api/upload/image
router.post('/image', fileUploadService.getImageUpload().single('image'), fileController.uploadImage)

// POST /api/upload/document
router.post('/document', fileUploadService.getDocumentUpload().single('document'), fileController.uploadDocument)

// File serving routes (no auth required for public access, but can be restricted)
// GET /api/files/* - Use regex pattern for Express 5 catch-all
router.get(/^\/files\/(.+)$/, fileController.getFile)

// DELETE /api/files/* (requires auth)
router.delete(/^\/files\/(.+)$/, fileController.deleteFile)

module.exports = router

