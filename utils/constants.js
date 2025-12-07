const constants = {
    // Election Phases
    ELECTION_PHASES: {
        REGISTRATION: 'REGISTRATION',
        NOMINATION: 'NOMINATION',
        CAMPAIGN: 'CAMPAIGN',
        VOTING: 'VOTING',
        RESULTS: 'RESULTS',
        COMPLETED: 'COMPLETED'
    },

    // Election Status
    ELECTION_STATUS: {
        DRAFT: 'DRAFT',
        ACTIVE: 'ACTIVE',
        COMPLETED: 'COMPLETED',
        CANCELLED: 'CANCELLED',
        SUSPENDED: 'SUSPENDED'
    },

    // Election Types
    ELECTION_TYPE: {
        SRC_ELECTION: 'SRC_ELECTION',
        STUDENT_COUNCIL: 'STUDENT_COUNCIL',
        DEPARTMENT: 'DEPARTMENT',
        ASSOCIATION: 'ASSOCIATION',
        ORGANIZATION: 'ORGANIZATION',
        PUBLIC: 'PUBLIC'
    },

    // Vote Status
    VOTE_STATUS: {
        CAST: 'CAST',
        VERIFIED: 'VERIFIED',
        COUNTED: 'COUNTED',
        DISPUTED: 'DISPUTED',
        INVALID: 'INVALID',
        RECOUNTED: 'RECOUNTED'
    },

    // Voter Eligibility Status
    ELIGIBILITY_STATUS: {
        ELIGIBLE: 'ELIGIBLE',
        NOT_ELIGIBLE: 'NOT_ELIGIBLE',
        PENDING: 'PENDING',
        VERIFIED: 'VERIFIED',
        SUSPENDED: 'SUSPENDED'
    },

    // Candidate Status
    CANDIDATE_STATUS: {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        WITHDRAWN: 'WITHDRAWN',
        DISQUALIFIED: 'DISQUALIFIED',
        SUSPENDED: 'SUSPENDED'
    },

    // User Roles
    USER_ROLES: {
        SUPER_ADMIN: 'SUPER_ADMIN',
        ADMIN: 'ADMIN',
        ELECTION_MANAGER: 'ELECTION_MANAGER',
        ELECTION_OFFICER: 'ELECTION_OFFICER',
        VOTER: 'VOTER',
        CANDIDATE: 'CANDIDATE',
        ASSOCIATION_ADMIN: 'ASSOCIATION_ADMIN'
    },

    // Notification Types
    NOTIFICATION_TYPE: {
        ELECTION_REMINDER: 'ELECTION_REMINDER',
        REGISTRATION_OPEN: 'REGISTRATION_OPEN',
        VOTING_OPEN: 'VOTING_OPEN',
        RESULTS_AVAILABLE: 'RESULTS_AVAILABLE',
        CANDIDATE_APPROVED: 'CANDIDATE_APPROVED',
        CANDIDATE_REJECTED: 'CANDIDATE_REJECTED',
        SECRET_CODE_SENT: 'SECRET_CODE_SENT',
        VOTE_CAST: 'VOTE_CAST',
        ELECTION_COMPLETED: 'ELECTION_COMPLETED',
        CUSTOM: 'CUSTOM'
    },

    // Notification Channels
    NOTIFICATION_CHANNEL: {
        EMAIL: 'EMAIL',
        SMS: 'SMS',
        PUSH: 'PUSH',
        IN_APP: 'IN_APP',
        SOCIAL_MEDIA: 'SOCIAL_MEDIA'
    },

    // Notification Status
    NOTIFICATION_STATUS: {
        PENDING: 'PENDING',
        SENT: 'SENT',
        FAILED: 'FAILED',
        CANCELLED: 'CANCELLED'
    },

    // Security Event Types
    SECURITY_EVENT_TYPE: {
        SECRET_CODE_VALIDATION_FAILED: 'SECRET_CODE_VALIDATION_FAILED',
        SECRET_CODE_VALIDATION_SUCCESS: 'SECRET_CODE_VALIDATION_SUCCESS',
        SECRET_CODE_GENERATION: 'SECRET_CODE_GENERATION',
        SECRET_CODE_DEACTIVATION: 'SECRET_CODE_DEACTIVATION',
        VOTE_CAST_SUCCESS: 'VOTE_CAST_SUCCESS',
        VOTE_CAST_FAILED: 'VOTE_CAST_FAILED',
        VOTE_INTEGRITY_CHECK: 'VOTE_INTEGRITY_CHECK',
        VOTE_CHAIN_VERIFICATION: 'VOTE_CHAIN_VERIFICATION',
        SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
        RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        DEVICE_FINGERPRINT_MISMATCH: 'DEVICE_FINGERPRINT_MISMATCH',
        UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
        ADMIN_ACTION: 'ADMIN_ACTION',
        DATA_ACCESS: 'DATA_ACCESS',
        DATA_MODIFICATION: 'DATA_MODIFICATION',
        CONFIGURATION_CHANGE: 'CONFIGURATION_CHANGE'
    },

    // Security Event Severity
    SECURITY_SEVERITY: {
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    },

    // Voting Methods
    VOTING_METHOD: {
        SINGLE_CHOICE: 'SINGLE_CHOICE',
        MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
        RANKED_CHOICE: 'RANKED_CHOICE',
        APPROVAL: 'APPROVAL',
        PROPORTIONAL: 'PROPORTIONAL'
    },

    // Organization Types
    ORGANIZATION_TYPE: {
        NON_PROFIT: 'NON_PROFIT',
        PROFESSIONAL: 'PROFESSIONAL',
        SOCIAL: 'SOCIAL',
        RELIGIOUS: 'RELIGIOUS',
        POLITICAL: 'POLITICAL',
        EDUCATIONAL: 'EDUCATIONAL',
        OTHER: 'OTHER'
    },

    // School Types
    SCHOOL_TYPE: {
        PRIMARY: 'PRIMARY',
        SECONDARY: 'SECONDARY',
        TERTIARY: 'TERTIARY',
        UNIVERSITY: 'UNIVERSITY',
        VOCATIONAL: 'VOCATIONAL'
    },

    // Audit Action Types
    AUDIT_ACTION_TYPE: {
        CREATE: 'CREATE',
        UPDATE: 'UPDATE',
        DELETE: 'DELETE',
        READ: 'READ',
        LOGIN: 'LOGIN',
        LOGOUT: 'LOGOUT',
        APPROVE: 'APPROVE',
        REJECT: 'REJECT',
        VERIFY: 'VERIFY',
        SEND: 'SEND',
        EXPORT: 'EXPORT'
    },

    // HTTP Status Codes
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        VALIDATION_ERROR: 422,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },

    // Error Messages
    ERROR_MESSAGES: {
        UNAUTHORIZED: 'Unauthorized access',
        FORBIDDEN: 'Access forbidden',
        NOT_FOUND: 'Resource not found',
        VALIDATION_ERROR: 'Validation failed',
        INTERNAL_ERROR: 'Internal server error',
        DATABASE_ERROR: 'Database error',
        NETWORK_ERROR: 'Network error',
        TIMEOUT: 'Request timeout'
    },

    // Pagination Defaults
    PAGINATION: {
        DEFAULT_PAGE: 1,
        DEFAULT_LIMIT: 10,
        MAX_LIMIT: 100
    },

    // Secret Code Configuration
    SECRET_CODE: {
        LENGTH: 6,
        MAX_ATTEMPTS: 3,
        LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
        CHARACTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    },

    // Session Configuration
    SESSION: {
        TIMEOUT: 30 * 60 * 1000, // 30 minutes
        MAX_SESSIONS: 5,
        CLEANUP_INTERVAL: 5 * 60 * 1000 // 5 minutes
    },

    // Rate Limiting
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15 minutes
        MAX_REQUESTS: 100
    },

    // File Upload
    FILE_UPLOAD: {
        MAX_SIZE: 5 * 1024 * 1024, // 5MB
        ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    },

    // Email Templates
    EMAIL_TEMPLATES: {
        WELCOME: 'welcome',
        SECRET_CODE: 'secret-code',
        VOTE_CONFIRMATION: 'vote-confirmation',
        RESULTS_AVAILABLE: 'results-available',
        PASSWORD_RESET: 'password-reset',
        ACCOUNT_VERIFICATION: 'account-verification'
    },

    // Cache Keys
    CACHE_KEYS: {
        ELECTION: 'election',
        VOTER: 'voter',
        CANDIDATE: 'candidate',
        RESULT: 'result',
        STATISTICS: 'statistics'
    },

    // Cache TTL (Time To Live)
    CACHE_TTL: {
        SHORT: 60, // 1 minute
        MEDIUM: 300, // 5 minutes
        LONG: 3600, // 1 hour
        VERY_LONG: 86400 // 24 hours
    },

    // Job Types
    JOB_TYPES: {
        CLEANUP: 'cleanup',
        NOTIFICATION: 'notification',
        RESULT: 'result',
        ELECTION: 'election',
        MONITORING: 'monitoring'
    },

    // Job Status
    JOB_STATUS: {
        PENDING: 'PENDING',
        RUNNING: 'RUNNING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        CANCELLED: 'CANCELLED'
    },

    // Socket Events
    SOCKET_EVENTS: {
        CONNECT: 'connect',
        DISCONNECT: 'disconnect',
        VOTE_CAST: 'vote:cast',
        ELECTION_PHASE_CHANGE: 'election:phase-change',
        CANDIDATE_APPROVED: 'candidate:approved',
        NOTIFICATION_NEW: 'notification:new',
        RESULT_UPDATED: 'result:updated',
        ADMIN_ALERT: 'admin:alert'
    },

    // Regex Patterns
    REGEX: {
        EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        PHONE: /^\+?[\d\s()-]+$/,
        PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        SECRET_CODE: /^[A-Z0-9]{6}$/
    },

    // Default Passwords
    DEFAULT_PASSWORD: 'password123!',

    // Encryption
    ENCRYPTION: {
        ALGORITHM: 'aes-256-gcm',
        KEY_LENGTH: 32,
        IV_LENGTH: 16,
        SALT_ROUNDS: 12
    },

    // Hash Algorithms
    HASH: {
        VOTE: 'sha256',
        PASSWORD: 'bcrypt',
        SECRET_CODE: 'sha256'
    }
}

module.exports = constants

