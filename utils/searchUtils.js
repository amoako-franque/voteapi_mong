/**
 * Search Utilities
 * Provides advanced search and filtering capabilities
 */

/**
 * Build MongoDB search query from search parameters
 */
function buildSearchQuery(model, searchParams = {}) {
    const {
        search,
        filters = {},
        sort = {},
        dateRange = {},
        numericRange = {}
    } = searchParams

    const query = {}

    // Full-text search
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' }

        // Determine searchable fields based on model
        const searchableFields = getSearchableFields(model)

        if (searchableFields.length > 0) {
            query.$or = searchableFields.map(field => ({
                [field]: searchRegex
            }))
        }
    }

    // Apply filters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
            if (Array.isArray(filters[key])) {
                query[key] = { $in: filters[key] }
            } else {
                query[key] = filters[key]
            }
        }
    })

    // Date range filters
    Object.keys(dateRange).forEach(key => {
        if (dateRange[key]) {
            if (dateRange[key].from || dateRange[key].to) {
                query[key] = {}
                if (dateRange[key].from) {
                    query[key].$gte = new Date(dateRange[key].from)
                }
                if (dateRange[key].to) {
                    query[key].$lte = new Date(dateRange[key].to)
                }
            }
        }
    })

    // Numeric range filters
    Object.keys(numericRange).forEach(key => {
        if (numericRange[key]) {
            if (numericRange[key].min !== undefined || numericRange[key].max !== undefined) {
                query[key] = {}
                if (numericRange[key].min !== undefined) {
                    query[key].$gte = numericRange[key].min
                }
                if (numericRange[key].max !== undefined) {
                    query[key].$lte = numericRange[key].max
                }
            }
        }
    })

    return query
}

/**
 * Get searchable fields for a model
 */
function getSearchableFields(model) {
    const modelName = model.modelName || model

    const fieldMap = {
        'Election': ['title', 'description', 'type', 'scope'],
        'User': ['email', 'firstname', 'lastname', 'username', 'phone'],
        'VoterRegistry': ['email', 'firstname', 'lastname', 'studentId', 'voterId'],
        'Candidate': ['fullName', 'email', 'studentId', 'manifesto'],
        'Position': ['title', 'description'],
        'Poll': ['title', 'description', 'category'],
        'School': ['name', 'shortName', 'code'],
        'Association': ['name', 'shortName', 'code']
    }

    return fieldMap[modelName] || []
}

/**
 * Build sort object from sort parameters
 */
function buildSort(sortParams = {}) {
    const sort = {}

    if (typeof sortParams === 'string') {
        // Simple string sort: "field" or "-field"
        const field = sortParams.startsWith('-') ? sortParams.slice(1) : sortParams
        const direction = sortParams.startsWith('-') ? -1 : 1
        sort[field] = direction
    } else if (typeof sortParams === 'object') {
        // Object sort: { field: 1 } or { field: -1 }
        Object.assign(sort, sortParams)
    }

    // Default sort if none provided
    if (Object.keys(sort).length === 0) {
        sort.createdAt = -1
    }

    return sort
}

/**
 * Build pagination parameters
 */
function buildPagination(page = 1, limit = 20) {
    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))
    const skip = (pageNum - 1) * limitNum

    return {
        page: pageNum,
        limit: limitNum,
        skip
    }
}

/**
 * Format search results with pagination
 */
function formatSearchResults(data, total, pagination) {
    return {
        data,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            pages: Math.ceil(total / pagination.limit),
            hasNext: pagination.page * pagination.limit < total,
            hasPrev: pagination.page > 1
        }
    }
}

/**
 * Parse search query string
 * Supports: field:value, field>value, field<value, field>=value, field<=value
 */
function parseSearchQuery(searchString) {
    const query = {}
    const filters = {}

    if (!searchString) {
        return { query, filters }
    }

    // Split by spaces but preserve quoted strings
    const parts = searchString.match(/(?:[^\s"]+|"[^"]*")+/g) || []

    parts.forEach(part => {
        // Handle field:value format
        if (part.includes(':')) {
            const [field, ...valueParts] = part.split(':')
            const value = valueParts.join(':').replace(/^"|"$/g, '')

            if (field && value) {
                filters[field.trim()] = value.trim()
            }
        } else {
            // General search term
            if (!query.$or) {
                query.$or = []
            }
        }
    })

    return { query, filters }
}

module.exports = {
    buildSearchQuery,
    getSearchableFields,
    buildSort,
    buildPagination,
    formatSearchResults,
    parseSearchQuery
}

