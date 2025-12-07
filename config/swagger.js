const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'VoteAPI - Enterprise Voting & Polling System',
            version: '1.0.0',
            description: 'A comprehensive RESTful API for managing elections, voting, and public polls',
            contact: {
                name: 'VoteAPI Support',
                email: 'support@voteapi.com'
            },
            license: {
                name: 'ISC',
                url: 'https://opensource.org/licenses/ISC'
            }
        },
        servers: [
            {
                url: process.env.API_BASE_URL || 'http://localhost:57788',
                description: 'Development server'
            },
            {
                url: 'https://api.voteapi.com',
                description: 'Production server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter JWT token'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false
                        },
                        error: {
                            type: 'string',
                            example: 'Error message'
                        },
                        statusCode: {
                            type: 'number',
                            example: 400
                        }
                    }
                },
                Success: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: true
                        },
                        message: {
                            type: 'string',
                            example: 'Operation successful'
                        },
                        data: {
                            type: 'object'
                        }
                    }
                },
                User: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                            example: '507f1f77bcf86cd799439011'
                        },
                        email: {
                            type: 'string',
                            example: 'user@example.com'
                        },
                        firstname: {
                            type: 'string',
                            example: 'John'
                        },
                        lastname: {
                            type: 'string',
                            example: 'Doe'
                        },
                        role: {
                            type: 'string',
                            enum: ['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'ASSOCIATION_ADMIN', 'PROFESSIONAL_ASSOCIATION_ADMIN', 'ELECTION_OFFICER'],
                            example: 'ADMIN'
                        }
                    }
                },
                Election: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string'
                        },
                        title: {
                            type: 'string',
                            example: 'Student Representative Council Elections 2025'
                        },
                        description: {
                            type: 'string'
                        },
                        status: {
                            type: 'string',
                            enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
                            example: 'ACTIVE'
                        },
                        startDateTime: {
                            type: 'string',
                            format: 'date-time'
                        },
                        endDateTime: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Vote: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string'
                        },
                        electionId: {
                            type: 'string'
                        },
                        positionId: {
                            type: 'string'
                        },
                        candidateId: {
                            type: 'string'
                        },
                        voterId: {
                            type: 'string'
                        },
                        status: {
                            type: 'string',
                            enum: ['CAST', 'VERIFIED', 'COUNTED', 'DISPUTED', 'INVALID'],
                            example: 'CAST'
                        },
                        timestamp: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                },
                Poll: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string'
                        },
                        title: {
                            type: 'string',
                            example: 'Best Pizza Place'
                        },
                        pollType: {
                            type: 'string',
                            enum: ['RATING', 'COMPARISON'],
                            example: 'COMPARISON'
                        },
                        category: {
                            type: 'string',
                            example: 'FOOD'
                        },
                        status: {
                            type: 'string',
                            enum: ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'],
                            example: 'ACTIVE'
                        }
                    }
                }
            }
        },
        security: [
            {
                bearerAuth: []
            }
        ]
    },
    apis: [
        './routes/*.js',
        './controllers/**/*.controller.js',
        './app.js'
    ]
}

const swaggerSpec = swaggerJsdoc(options)

// Export both the spec and the UI
module.exports = {
    swaggerSpec,
    swaggerUi,
    // Also export as default for backward compatibility
    ...swaggerSpec
}
