const fs = require('fs')
const path = require('path')

// Configuration
const AUDIT_FILE = path.join(__dirname, '../logs/audit.json')

/**
 * Initialize audit file and logs directory
 */
const initializeAuditFile = () => {
    const logsDir = path.dirname(AUDIT_FILE)
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
    }

    if (!fs.existsSync(AUDIT_FILE)) {
        fs.writeFileSync(AUDIT_FILE, '[]')
    }
}

/**
 * Generate unique ID for audit entry
 * @returns {string} Unique ID
 */
const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * Add audit entry to log file
 * @param {Object} entry - Audit entry data
 */
const addAuditEntry = (entry) => {
    try {
        const data = fs.readFileSync(AUDIT_FILE, 'utf8')
        let auditArray = []

        try {
            auditArray = JSON.parse(data)
        } catch (error) {
            auditArray = []
        }

        if (!Array.isArray(auditArray)) {
            auditArray = []
        }

        auditArray.push({
            ...entry,
            timestamp: new Date().toISOString(),
            id: generateId()
        })

        fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditArray, null, 2))
    } catch (error) {
        console.error('Error writing audit log:', error)
    }
}

/**
 * Log user audit action
 * @param {string} action - Action performed
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 */
const logAudit = (action, userId, details = {}) => {
    addAuditEntry({
        type: 'audit',
        action,
        userId,
        category: 'user_action',
        details,
        level: 'info'
    })
}

/**
 * Log data access event
 * @param {string} operation - Operation type (read, write, delete, etc.)
 * @param {string} resource - Resource accessed
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 */
const logDataAccess = (operation, resource, userId, details = {}) => {
    addAuditEntry({
        type: 'audit',
        action: 'data_access',
        operation,
        resource,
        userId,
        category: 'data_access',
        details,
        level: 'info'
    })
}

/**
 * Log system audit action
 * @param {string} action - System action
 * @param {Object} details - Additional details
 */
const logSystemAudit = (action, details = {}) => {
    addAuditEntry({
        type: 'audit',
        action,
        category: 'system_action',
        details,
        level: 'info'
    })
}

/**
 * Log configuration change
 * @param {string} setting - Setting name
 * @param {*} oldValue - Old value
 * @param {*} newValue - New value
 * @param {string} userId - User ID
 * @param {Object} details - Additional details
 */
const logConfigurationChange = (setting, oldValue, newValue, userId, details = {}) => {
    addAuditEntry({
        type: 'audit',
        action: 'configuration_change',
        setting,
        oldValue,
        newValue,
        userId,
        category: 'configuration',
        details,
        level: 'info'
    })
}

/**
 * Log security event
 * @param {string} event - Security event type
 * @param {Object} details - Event details
 */
const logSecurityEvent = (event, details = {}) => {
    addAuditEntry({
        type: 'audit',
        action: 'security_event',
        event,
        category: 'security',
        details,
        level: 'warn'
    })
}

/**
 * Get audit entries with optional filter
 * @param {Object} filter - Filter criteria
 * @returns {Array} Filtered audit entries
 */
const getAuditEntries = (filter = {}) => {
    try {
        const data = fs.readFileSync(AUDIT_FILE, 'utf8')
        let auditArray = JSON.parse(data)

        if (!Array.isArray(auditArray)) {
            return []
        }

        if (Object.keys(filter).length > 0) {
            return auditArray.filter(entry => {
                return Object.keys(filter).every(key => {
                    if (key === 'userId') {
                        return entry.userId === filter[key]
                    }
                    if (key === 'action') {
                        return entry.action === filter[key]
                    }
                    if (key === 'category') {
                        return entry.category === filter[key]
                    }
                    if (key === 'date') {
                        return entry.timestamp.startsWith(filter[key])
                    }
                    return entry[key] === filter[key]
                })
            })
        }

        return auditArray
    } catch (error) {
        console.error('Error reading audit log:', error)
        return []
    }
}

/**
 * Search audit entries by query string
 * @param {string} query - Search query
 * @returns {Array} Matching audit entries
 */
const searchAuditEntries = (query) => {
    try {
        const data = fs.readFileSync(AUDIT_FILE, 'utf8')
        let auditArray = JSON.parse(data)

        if (!Array.isArray(auditArray)) {
            return []
        }

        const queryLower = query.toLowerCase()

        return auditArray.filter(entry =>
            JSON.stringify(entry).toLowerCase().includes(queryLower)
        )
    } catch (error) {
        console.error('Error searching audit log:', error)
        return []
    }
}

/**
 * Clear all audit log entries
 */
const clearAuditLog = () => {
    fs.writeFileSync(AUDIT_FILE, '[]')
}

/**
 * Get audit statistics
 * @returns {Object} Audit statistics
 */
const getAuditStats = () => {
    try {
        const entries = getAuditEntries()

        const stats = {
            totalEntries: entries.length,
            byCategory: {},
            byAction: {},
            byUser: {},
            recentEntries: entries.slice(-10)
        }

        entries.forEach(entry => {
            // Count by category
            stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1

            // Count by action
            stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1

            // Count by user
            if (entry.userId) {
                stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1
            }
        })

        return stats
    } catch (error) {
        console.error('Error getting audit stats:', error)
        return { totalEntries: 0, byCategory: {}, byAction: {}, byUser: {}, recentEntries: [] }
    }
}

// Initialize audit file on module load
initializeAuditFile()

module.exports = {
    initializeAuditFile,
    generateId,
    addAuditEntry,
    logAudit,
    logDataAccess,
    logSystemAudit,
    logConfigurationChange,
    logSecurityEvent,
    getAuditEntries,
    searchAuditEntries,
    clearAuditLog,
    getAuditStats
}
