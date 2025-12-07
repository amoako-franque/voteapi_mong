// ================================
// VoteAPI MongoDB Replica Set Initialization
// ================================
// This script initializes the MongoDB replica set for production
// It runs automatically when the primary container starts

// Initialize replica set
rs.initiate({
    _id: "rs0",
    members: [
        { _id: 0, host: "mongo-primary:27017", priority: 2 },
        { _id: 1, host: "mongo-secondary:27017", priority: 1 },
        { _id: 2, host: "mongo-arbiter:27017", arbiterOnly: true }
    ]
})

// Wait for replica set to initialize
sleep(5000)

// Create application database and user
db = db.getSiblingDB('voteapi')

// Create indexes for better performance
db.createCollection('users')
db.createCollection('elections')
db.createCollection('votes')
db.createCollection('voters')
db.createCollection('candidates')
db.createCollection('positions')
db.createCollection('schools')
db.createCollection('associations')
db.createCollection('polls')
db.createCollection('pollvotes')
db.createCollection('audit_logs')
db.createCollection('login_logs')
db.createCollection('api_request_logs')
db.createCollection('notifications')
db.createCollection('tokens')
db.createCollection('blacklisted_tokens')

print('VoteAPI database initialized successfully')

