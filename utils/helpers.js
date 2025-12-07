const crypto = require('crypto')
const logger = require('./logger')

/**
 * Format date to readable string
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (YYYY-MM-DD HH:mm:ss)
 * @returns {string|null} Formatted date string
 */
const formatDate = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
    if (!date) return null

    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds)
}

/**
 * Get relative time (e.g., "2 hours ago")
 * @param {Date|string} date - Date to compare
 * @returns {string|null} Relative time string
 */
const getRelativeTime = (date) => {
    if (!date) return null

    const now = new Date()
    const past = new Date(date)
    const diffInSeconds = Math.floor((now - past) / 1000)

    if (diffInSeconds < 60) {
        return `${ diffInSeconds } seconds ago`
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
        return `${ diffInMinutes } minutes ago`
    }

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
        return `${ diffInHours } hours ago`
    }

    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 30) {
        return `${ diffInDays } days ago`
    }

    const diffInMonths = Math.floor(diffInDays / 30)
    if (diffInMonths < 12) {
        return `${ diffInMonths } months ago`
    }

    const diffInYears = Math.floor(diffInMonths / 12)
    return `${ diffInYears } years ago`
}

/**
 * Generate unique ID
 * @param {number} length - Length of ID in bytes
 * @returns {string} Unique ID
 */
const generateId = (length = 12) => {
    return crypto.randomBytes(length).toString('hex')
}

/**
 * Generate random alphanumeric string
 * @param {number} length - Length of string
 * @param {string} chars - Characters to use
 * @returns {string} Random string
 */
const generateRandomString = (length = 8, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
}

/**
 * Sanitize string (remove script tags)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
    if (!str) return ''
    return str.toString().trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

/**
 * Capitalize first letter
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
const capitalizeFirst = (str) => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Format phone number
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone number
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return ''
    const cleaned = phone.replace(/\D/g, '')
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
}

/**
 * Format percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
const formatPercentage = (value, total, decimals = 2) => {
    if (!total || total === 0) return '0.00%'
    return ((value / total) * 100).toFixed(decimals) + '%'
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
const deepClone = (obj) => {
    return JSON.parse(JSON.stringify(obj))
}

/**
 * Get pagination info
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} Pagination info
 */
const getPaginationInfo = (page, limit, total) => {
    const totalPages = Math.ceil(total / limit)
    return {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        previousPage: page > 1 ? page - 1 : null
    }
}

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
}

/**
 * Validate phone number
 * @param {string} phone - Phone to validate
 * @returns {boolean} True if valid
 */
const isValidPhone = (phone) => {
    const regex = /^\+?[\d\s()-]+$/
    return regex.test(phone) && phone.replace(/\D/g, '').length >= 10
}

/**
 * Mask sensitive data
 * @param {string} data - Data to mask
 * @param {string} maskChar - Character to use for masking
 * @param {number} visibleChars - Number of visible characters at end
 * @returns {string} Masked data
 */
const maskSensitiveData = (data, maskChar = '*', visibleChars = 4) => {
    if (!data || data.length <= visibleChars) return data

    const maskedLength = data.length - visibleChars
    const maskedChars = maskChar.repeat(maskedLength)

    return data.substring(0, 0) + maskedChars + data.substring(data.length - visibleChars)
}

/**
 * Generate hash
 * @param {string} data - Data to hash
 * @param {string} algorithm - Hash algorithm
 * @returns {string} Hash
 */
const generateHash = (data, algorithm = 'sha256') => {
    return crypto.createHash(algorithm).update(data).digest('hex')
}

/**
 * Parse date range
 * @param {string} dateString - Date range string
 * @returns {Object} Start and end dates
 */
const parseDateRange = (dateString) => {
    if (!dateString) return { startDate: null, endDate: null }

    if (dateString.includes('to') || dateString.includes('-')) {
        const separator = dateString.includes('to') ? 'to' : '-'
        const [start, end] = dateString.split(separator).map(s => s.trim())

        return {
            startDate: new Date(start),
            endDate: new Date(end)
        }
    }

    return {
        startDate: new Date(dateString),
        endDate: new Date(dateString)
    }
}

/**
 * Check if date is in range
 * @param {Date|string} date - Date to check
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {boolean} True if in range
 */
const isDateInRange = (date, startDate, endDate) => {
    if (!date) return false
    const checkDate = new Date(date)
    return checkDate >= new Date(startDate) && checkDate <= new Date(endDate)
}

/**
 * Calculate age from date of birth
 * @param {Date|string} dateOfBirth - Date of birth
 * @returns {number|null} Age in years
 */
const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }

    return age
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} delay - Initial delay in ms
 * @returns {Promise} Result of function
 */
const retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        } catch (error) {
            if (i === maxRetries - 1) throw error

            const backoffDelay = delay * Math.pow(2, i)
            logger.warn(`Retry attempt ${ i + 1 }/${ maxRetries } after ${ backoffDelay }ms`)
            await sleep(backoffDelay)
        }
    }
}

/**
 * Chunk array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array} Array of chunks
 */
const chunkArray = (array, chunkSize) => {
    const chunks = []
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
}

/**
 * Remove duplicates from array
 * @param {Array} array - Array to process
 * @param {string} key - Key to check for duplicates (optional)
 * @returns {Array} Array without duplicates
 */
const removeDuplicates = (array, key = null) => {
    if (!key) {
        return [...new Set(array)]
    }

    const seen = new Set()
    return array.filter(item => {
        const value = item[key]
        if (seen.has(value)) {
            return false
        }
        seen.add(value)
        return true
    })
}

/**
 * Sort array by key
 * @param {Array} array - Array to sort
 * @param {string} key - Key to sort by
 * @param {string} order - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted array
 */
const sortByKey = (array, key, order = 'asc') => {
    return [...array].sort((a, b) => {
        if (order === 'asc') {
            return a[key] > b[key] ? 1 : -1
        } else {
            return a[key] < b[key] ? 1 : -1
        }
    })
}

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
const groupBy = (array, key) => {
    return array.reduce((result, item) => {
        const groupKey = item[key]
        if (!result[groupKey]) {
            result[groupKey] = []
        }
        result[groupKey].push(item)
        return result
    }, {})
}

/**
 * Parse query string to object
 * @param {string} queryString - Query string
 * @returns {Object} Parsed object
 */
const parseQueryString = (queryString) => {
    const params = {}
    if (!queryString) return params

    queryString.split('&').forEach(param => {
        const [key, value] = param.split('=')
        if (key) {
            params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : true
        }
    })

    return params
}

/**
 * Check if string is valid JSON
 * @param {string} str - String to check
 * @returns {boolean} True if valid JSON
 */
const isValidJSON = (str) => {
    try {
        JSON.parse(str)
        return true
    } catch (e) {
        return false
    }
}

/**
 * Safely parse JSON
 * @param {string} str - JSON string
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
const safeJSONParse = (str, defaultValue = null) => {
    try {
        return JSON.parse(str)
    } catch (e) {
        return defaultValue
    }
}

module.exports = {
    formatDate,
    getRelativeTime,
    generateId,
    generateRandomString,
    sanitizeString,
    capitalizeFirst,
    formatPhoneNumber,
    formatPercentage,
    deepClone,
    getPaginationInfo,
    isValidEmail,
    isValidPhone,
    maskSensitiveData,
    generateHash,
    parseDateRange,
    isDateInRange,
    calculateAge,
    sleep,
    retryWithBackoff,
    chunkArray,
    removeDuplicates,
    sortByKey,
    groupBy,
    parseQueryString,
    isValidJSON,
    safeJSONParse
}
