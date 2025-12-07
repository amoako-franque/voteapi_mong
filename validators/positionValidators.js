const { body, param } = require('express-validator')
const mongoose = require('mongoose')
const { validateObjectId, validateString, validateEnum, validateNumber, validateBoolean, validate } = require('./commonValidators')

/**
 * Validators for position endpoints
 */

// Validate position creation
const validateCreatePosition = [
    validateObjectId('electionId'),
    validateString('title', { required: true, minLength: 3, maxLength: 200 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateString('shortDescription', { required: false, maxLength: 200 }),
    validateNumber('orderIndex', { required: true, min: 1 }),
    validateEnum('category', ['EXECUTIVE', 'LEGISLATIVE', 'JUDICIAL', 'ADMINISTRATIVE', 'REPRESENTATIVE', 'CUSTOM'], false),
    validateEnum('level', ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'REPRESENTATIVE', 'MEMBER', 'CUSTOM'], false),
    validateEnum('scope', ['SCHOOL', 'ASSOCIATION'], true),
    validateNumber('maxCandidates', { required: false, min: 1 }),
    validateNumber('minCandidates', { required: false, min: 1 }),
    validateNumber('maxWinners', { required: false, min: 1 }),
    validateBoolean('isRequired', false),
    validateBoolean('isPublic', false),
    validate
]

// Validate position update
const validateUpdatePosition = [
    validateObjectId('positionId'),
    validateString('title', { required: false, minLength: 3, maxLength: 200 }),
    validateString('description', { required: false, maxLength: 2000 }),
    validateNumber('orderIndex', { required: false, min: 1 }),
    validateEnum('status', ['ACTIVE', 'INACTIVE', 'SUSPENDED'], false),
    validate
]

// Validate position ID parameter
const validatePositionId = [
    validateObjectId('positionId'),
    validate
]

// Validate election ID for positions
const validateElectionIdForPositions = [
    validateObjectId('electionId'),
    validate
]

module.exports = {
    validateCreatePosition,
    validateUpdatePosition,
    validatePositionId,
    validateElectionIdForPositions
}

