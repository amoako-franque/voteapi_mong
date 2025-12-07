const handlebars = require('handlebars')
const fs = require('fs').promises
const path = require('path')
const logger = require('../utils/logger')

/**
 * Template Service
 * Handles rendering of Handlebars templates
 */
class TemplateService {
    constructor() {
        this.templates = {}
        this.templatesDir = path.join(__dirname, '..', 'templates')
        this.layoutTemplate = null
        this.templatesLoaded = false
        // Load templates asynchronously
        this.loadTemplates().catch(error => {
            logger.error({
                type: 'template_init_error',
                error: error.message
            }, 'Failed to initialize templates')
        })
    }

    /**
     * Load all templates from the templates directory
     */
    async loadTemplates() {
        try {
            // Load layout template
            const layoutPath = path.join(this.templatesDir, 'layout.hbs')
            const layoutContent = await fs.readFile(layoutPath, 'utf-8')
            this.layoutTemplate = handlebars.compile(layoutContent)

            // Load email templates
            const emailsDir = path.join(this.templatesDir, 'emails')
            const emailFiles = await fs.readdir(emailsDir)

            for (const file of emailFiles) {
                if (file.endsWith('.hbs')) {
                    const templateName = file.replace('.hbs', '')
                    const templatePath = path.join(emailsDir, file)
                    const templateContent = await fs.readFile(templatePath, 'utf-8')
                    this.templates[templateName] = handlebars.compile(templateContent)
                }
            }

            // Load other templates
            const templateFiles = ['election-results', 'election-period', 'voter-notification']
            for (const templateName of templateFiles) {
                const templatePath = path.join(this.templatesDir, `${templateName}.hbs`)
                try {
                    const templateContent = await fs.readFile(templatePath, 'utf-8')
                    this.templates[templateName] = handlebars.compile(templateContent)
                } catch (error) {
                    logger.warn(`Template ${templateName} not found, skipping`)
                }
            }

            // Register Handlebars helpers
            this.registerHelpers()

            this.templatesLoaded = true
            logger.info('Templates loaded successfully')
        } catch (error) {
            logger.error({
                type: 'template_load_error',
                error: error.message
            }, 'Failed to load templates')
            this.templatesLoaded = false
        }
    }

    /**
     * Register Handlebars helpers
     */
    registerHelpers() {
        // Format date helper
        handlebars.registerHelper('formatDate', (date, format) => {
            if (!date) return ''
            const d = new Date(date)
            if (format === 'short') {
                return d.toLocaleDateString()
            } else if (format === 'long') {
                return d.toLocaleString()
            }
            return d.toISOString()
        })

        // Format currency helper
        handlebars.registerHelper('formatCurrency', (amount, currency = 'GHS') => {
            return new Intl.NumberFormat('en-GH', {
                style: 'currency',
                currency: currency
            }).format(amount)
        })

        // Conditional helper
        handlebars.registerHelper('if_eq', (a, b, options) => {
            if (a === b) {
                return options.fn(this)
            }
            return options.inverse(this)
        })

        // Math helpers
        handlebars.registerHelper('add', (a, b) => a + b)
        handlebars.registerHelper('subtract', (a, b) => a - b)
        handlebars.registerHelper('multiply', (a, b) => a * b)
        handlebars.registerHelper('divide', (a, b) => a / b)

        // String helpers
        handlebars.registerHelper('uppercase', (str) => str ? str.toUpperCase() : '')
        handlebars.registerHelper('lowercase', (str) => str ? str.toLowerCase() : '')
        handlebars.registerHelper('capitalize', (str) => {
            if (!str) return ''
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
        })
    }

    /**
     * Render a template with data
     * @param {string} templateName - Name of the template (without .hbs)
     * @param {object} data - Data to pass to the template
     * @param {boolean} useLayout - Whether to wrap in layout template
     * @returns {string} Rendered HTML
     */
    async render(templateName, data = {}, useLayout = true) {
        try {
            // Wait for templates to load if not loaded yet
            if (!this.templatesLoaded) {
                await this.loadTemplates()
            }

            const template = this.templates[templateName]
            if (!template) {
                throw new Error(`Template ${templateName} not found`)
            }

            // Render the template
            const body = template(data)

            // Wrap in layout if requested
            if (useLayout && this.layoutTemplate) {
                return this.layoutTemplate({
                    ...data,
                    title: data.title || 'VoteAPI',
                    body: body
                })
            }

            return body
        } catch (error) {
            logger.error({
                type: 'template_render_error',
                templateName,
                error: error.message
            }, `Failed to render template ${templateName}`)
            throw error
        }
    }

    /**
     * Render password reset email
     */
    async renderPasswordReset(data) {
        return this.render('password-reset', {
            userName: data.userName || data.name,
            resetUrl: data.resetUrl,
            expiresIn: data.expiresIn || '1 hour'
        }, false) // Don't use layout as template has its own HTML structure
    }

    /**
     * Render voter credentials email
     */
    async renderVoterCredentials(data) {
        return this.render('voter-credentials', {
            voterName: data.voterName || data.name,
            schoolName: data.schoolName,
            voterId: data.voterId,
            secretCode: data.secretCode,
            votingUrl: data.votingUrl || process.env.FRONTEND_URL || 'http://localhost:3000'
        }, false) // Don't use layout as template has its own HTML structure
    }

    /**
     * Render election results
     */
    async renderElectionResults(data) {
        return this.render('election-results', {
            election: data.election,
            results: data.results,
            is_final: data.isFinal || false,
            timestamp: new Date().toLocaleString()
        }, true) // Use layout
    }

    /**
     * Render election period notification
     */
    async renderElectionPeriod(data) {
        return this.render('election-period', {
            election: data.election,
            start_datetime: data.startDateTime || data.election?.startDateTime,
            end_datetime: data.endDateTime || data.election?.endDateTime,
            timezone: data.timezone || data.election?.timezone || 'Africa/Accra'
        }, true) // Use layout
    }

    /**
     * Render voter notification
     */
    async renderVoterNotification(data) {
        return this.render('voter-notification', {
            voter: data.voter,
            school: data.school,
            positions: data.positions || []
        }, true) // Use layout
    }
}

module.exports = new TemplateService()

