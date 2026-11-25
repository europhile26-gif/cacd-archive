/**
 * Scraper CLI Commands
 * Status reporting for the scraper's data sources.
 */

const chalk = require('chalk');
const { listSourcesWithLastScrape } = require('../../services/data-source-service');
const { formatError, formatInfo, createTable } = require('../utils/format');

// Shorthand aliases accepted by --source
const SOURCE_SLUG_ALIASES = {
  dcl: 'daily_cause_list',
  fhl: 'future_hearing_list'
};

const STATUS_COLOURS = {
  success: chalk.green,
  partial: chalk.yellow,
  failed: chalk.red
};

/**
 * Resolve a --source value (alias or full slug) to a slug
 * @param {string} source - Value passed to --source
 * @returns {string} Data source slug
 */
function resolveSourceSlug(source) {
  return SOURCE_SLUG_ALIASES[source.toLowerCase()] || source;
}

/**
 * Format a timestamp as local date and time, e.g. "25 Nov 2026, 07:03"
 * @param {Date|string|null} value - Timestamp
 * @returns {string} Formatted timestamp, or "Never"
 */
function formatTimestamp(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a scrape interval in minutes as "12h" or "30m"
 * @param {number} minutes - Interval in minutes
 * @returns {string} Formatted interval
 */
function formatInterval(minutes) {
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
}

/**
 * Format the scrape window hours, e.g. "08:00 – 18:00" or "No restriction"
 * @param {number} startHour - Window start hour
 * @param {number} endHour - Window end hour
 * @returns {string} Formatted window
 */
function formatWindow(startHour, endHour) {
  if (startHour === 0 && endHour === 24) return 'No restriction';
  const pad = (hour) => String(hour).padStart(2, '0');
  return `${pad(startHour)}:00 – ${pad(endHour)}:00`;
}

/**
 * Build the machine-readable status for one source
 * @param {Object} source - Row from listSourcesWithLastScrape
 * @returns {Object} Status object
 */
function toStatusJson(source) {
  return {
    slug: source.slug,
    display_name: source.display_name,
    enabled: source.enabled === 1,
    show_by_default: source.show_by_default === 1,
    scrape_interval_minutes: source.scrape_interval_minutes,
    scrape_window_start_hour: source.scrape_window_start_hour,
    scrape_window_end_hour: source.scrape_window_end_hour,
    hearing_count: Number(source.hearing_count),
    last_scrape: source.last_scrape_status
      ? {
          status: source.last_scrape_status,
          started_at: new Date(source.last_scrape_at).toISOString(),
          duration_ms: source.last_scrape_duration_ms,
          added: source.last_scrape_added || 0,
          updated: source.last_scrape_updated || 0,
          deleted: source.last_scrape_deleted || 0,
          error: source.last_scrape_error,
          error_cause: source.last_scrape_error_cause
        }
      : null,
    last_success_at: source.last_success_at ? new Date(source.last_success_at).toISOString() : null
  };
}

/**
 * Print one source as a key/value table
 * @param {Object} source - Row from listSourcesWithLastScrape
 */
function printSource(source) {
  const enabledLabel = source.enabled === 1 ? chalk.green('Enabled') : chalk.gray('Disabled');
  console.log(
    `${chalk.bold(source.display_name)} ${chalk.gray(`(${source.slug})`)}  ${enabledLabel}`
  );

  const table = createTable([]);
  const status = source.last_scrape_status;
  const colour = STATUS_COLOURS[status] || chalk.gray;
  const statusLabel = status ? colour(status.charAt(0).toUpperCase() + status.slice(1)) : '';

  table.push({ 'Last scrape': `${formatTimestamp(source.last_scrape_at)} ${statusLabel}`.trim() });

  if (status && status !== 'success') {
    table.push({ 'Last success': formatTimestamp(source.last_success_at) });
  }

  table.push(
    {
      'Last result': status
        ? `+${source.last_scrape_added || 0} / ~${source.last_scrape_updated || 0} / -${source.last_scrape_deleted || 0} ${chalk.gray('(add / update / delete)')}`
        : '-'
    },
    {
      Duration: source.last_scrape_duration_ms
        ? `${(source.last_scrape_duration_ms / 1000).toFixed(1)}s`
        : '-'
    },
    { 'Hearings stored': String(source.hearing_count) },
    { Interval: `Every ${formatInterval(source.scrape_interval_minutes)}` },
    {
      'Scrape window': formatWindow(source.scrape_window_start_hour, source.scrape_window_end_hour)
    },
    { 'Visible by default': source.show_by_default === 1 ? 'Yes' : 'No' }
  );

  if (source.last_scrape_error) {
    const cause = source.last_scrape_error_cause ? ` (${source.last_scrape_error_cause})` : '';
    table.push({ 'Last error': chalk.red(`${source.last_scrape_error}${cause}`) });
  }

  console.log(table.toString());
  console.log();
}

/**
 * Show each data source's latest scrape; exits 1 if an enabled source's last scrape failed
 * @param {Object} options - Commander options (source, json)
 */
async function status(options) {
  let exitCode = 0;

  try {
    let sources = await listSourcesWithLastScrape();

    if (options.source) {
      const slug = resolveSourceSlug(options.source);
      sources = sources.filter((source) => source.slug === slug);
      if (sources.length === 0) {
        throw new Error(`Data source '${options.source}' not found`);
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ sources: sources.map(toStatusJson) }, null, 2));
    } else {
      console.log();
      formatInfo('Scraper status');
      console.log();
      for (const source of sources) {
        printSource(source);
      }
    }

    const anyFailed = sources.some(
      (source) => source.enabled === 1 && source.last_scrape_status === 'failed'
    );
    exitCode = anyFailed ? 1 : 0;
  } catch (error) {
    formatError(`Failed to get scraper status: ${error.message}`);
    exitCode = 1;
  }

  process.exit(exitCode);
}

module.exports = {
  status,
  resolveSourceSlug,
  formatInterval,
  formatWindow,
  toStatusJson
};
