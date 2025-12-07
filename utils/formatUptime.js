/**
 * Utility function to format uptime in seconds to human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {object} - Formatted uptime with breakdown
 */
const formatUptime = (seconds) => {
    const uptimeSeconds = Math.floor(seconds)

    // Calculate time units
    const years = Math.floor(uptimeSeconds / (365 * 24 * 60 * 60))
    const months = Math.floor((uptimeSeconds % (365 * 24 * 60 * 60)) / (30 * 24 * 60 * 60))
    const weeks = Math.floor((uptimeSeconds % (30 * 24 * 60 * 60)) / (7 * 24 * 60 * 60))
    const days = Math.floor((uptimeSeconds % (7 * 24 * 60 * 60)) / (24 * 60 * 60))
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60)
    const secs = uptimeSeconds % 60

    // Build human-readable string
    const parts = []
    if (years > 0) parts.push(`${ years } ${ years === 1 ? 'year' : 'years' }`)
    if (months > 0) parts.push(`${ months } ${ months === 1 ? 'month' : 'months' }`)
    if (weeks > 0) parts.push(`${ weeks } ${ weeks === 1 ? 'week' : 'weeks' }`)
    if (days > 0) parts.push(`${ days } ${ days === 1 ? 'day' : 'days' }`)
    if (hours > 0) parts.push(`${ hours } ${ hours === 1 ? 'hour' : 'hours' }`)
    if (minutes > 0) parts.push(`${ minutes } ${ minutes === 1 ? 'minute' : 'minutes' }`)
    if (secs > 0 || parts.length === 0) parts.push(`${ secs } ${ secs === 1 ? 'second' : 'seconds' }`)

    // Return both formatted string and detailed breakdown
    return {
        raw: uptimeSeconds,
        formatted: parts.join(', '),
        breakdown: {
            years,
            months,
            weeks,
            days,
            hours,
            minutes,
            seconds: secs
        }
    }
}

module.exports = formatUptime

