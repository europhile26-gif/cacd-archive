/**
 * Search Commands
 *
 * Exercises the saved-search matching and notification logic from the command
 * line so phrase matching can be tested without sending an email. All commands
 * reuse the same production code paths (buildHearingSearchFilter, the
 * notification matcher, the email templates) so results mirror production.
 */

const { format } = require('date-fns');
const db = require('../../config/database');
const config = require('../../config/config');
const SavedSearch = require('../../models/SavedSearch');
const notificationService = require('../../services/notification-service');
const emailService = require('../../services/email-service');
const {
  buildHearingSearchFilter,
  stripSurroundingQuotes,
  SEARCH_COLUMNS
} = require('../../utils/search-filter');
const { confirm } = require('../utils/prompts');
const {
  formatError,
  formatInfo,
  formatWarning,
  formatSuccess,
  createTable
} = require('../utils/format');

/**
 * The today + tomorrow window used by the saved-search notification matcher.
 */
function notificationWindow() {
  return {
    today: format(new Date(), 'yyyy-MM-dd'),
    tomorrow: format(new Date(Date.now() + 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  };
}

/**
 * Resolve the list_date range for `search run`.
 * Defaults to today + tomorrow, matching the notification matcher.
 * --all searches every date; --from/--to override either bound.
 */
function resolveDateRange(options) {
  if (options.all) {
    return { from: null, to: null };
  }
  const { today, tomorrow } = notificationWindow();
  return {
    from: options.from || today,
    to: options.to || tomorrow
  };
}

/**
 * Run the phrase filter against the hearings table over a date range.
 * Returns { from, to, pattern, hearings }.
 */
async function executeSearch(phrase, options) {
  const { from, to } = resolveDateRange(options);
  const filter = buildHearingSearchFilter(phrase);
  const limit = parseInt(options.limit, 10) || 100;

  const where = [filter.sql];
  const params = [...filter.params];
  if (from) {
    where.unshift('list_date >= ?');
    params.unshift(from);
  }
  if (to) {
    where.push('list_date <= ?');
    params.push(to);
  }

  const sql = `
    SELECT case_number, case_details, hearing_type, additional_information,
           judge, venue, list_date, time
    FROM hearings
    WHERE ${where.join(' AND ')}
    ORDER BY list_date ASC, hearing_datetime ASC
    LIMIT ${limit}
  `;

  const hearings = await db.query(sql, params);
  return { from, to, pattern: filter.params[0], hearings };
}

/**
 * Which searched columns contain the phrase, for a given row.
 */
function matchedColumns(hearing, phrase) {
  const needle = stripSurroundingQuotes(phrase).toLowerCase();
  return SEARCH_COLUMNS.filter((c) => (hearing[c] || '').toString().toLowerCase().includes(needle));
}

/**
 * `search run <phrase>` — run the matcher for a phrase and print matches.
 */
async function runSearch(phrase, options) {
  try {
    if (!phrase || !phrase.trim()) {
      formatError(
        'A search phrase is required, e.g. cacd search run "Criminal Cases Review Commission"'
      );
      process.exit(1);
    }

    const { from, to, pattern, hearings } = await executeSearch(phrase, options);

    if (options.json) {
      const out = {
        phrase: stripSurroundingQuotes(phrase),
        pattern,
        from,
        to,
        count: hearings.length,
        matches: hearings.map((h) => ({
          case_number: h.case_number,
          case_details: h.case_details,
          hearing_type: h.hearing_type,
          judge: h.judge,
          venue: h.venue,
          list_date: h.list_date ? format(new Date(h.list_date), 'yyyy-MM-dd') : null,
          time: h.time,
          matched_columns: matchedColumns(h, phrase)
        }))
      };
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    console.log();
    formatInfo(`Phrase as searched: "${stripSurroundingQuotes(phrase)}" (case-insensitive, exact)`);
    formatInfo(`Date range: ${from ? from : 'any'} → ${to ? to : 'any'}`);
    if (options.verbose) {
      formatInfo(`LIKE pattern: ${pattern}`);
    }
    console.log();

    if (hearings.length === 0) {
      formatWarning('No matches found.');
      process.exit(0);
    }

    const table = createTable(['Date', 'Time', 'Case', 'Type', 'Venue']);
    for (const h of hearings) {
      const caseName = h.case_details || (h.case_number ? `Case ${h.case_number}` : 'Unknown Case');
      table.push([
        h.list_date ? format(new Date(h.list_date), 'EEE d MMM yyyy') : '—',
        h.time || '—',
        caseName,
        h.hearing_type || '—',
        h.venue || '—'
      ]);
    }
    console.log(table.toString());
    console.log();
    formatSuccess(`${hearings.length} match(es).`);

    if (options.verbose) {
      console.log();
      formatInfo('Matched column(s) per row:');
      for (const h of hearings) {
        const label = h.case_details || h.case_number || 'Unknown';
        const hit = matchedColumns(h, phrase);
        console.log(`  ${label}: ${hit.join(', ') || '(none — unexpected)'}`);
      }
    }

    process.exit(0);
  } catch (error) {
    formatError(`Search failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * `search saved [--user <email>]` — list real saved searches with their owners
 * and preview what each matches in the notification window (today + tomorrow),
 * exactly as the notification matcher would see them.
 */
async function savedSearches(options) {
  try {
    const where = [];
    const params = [];
    if (options.user) {
      where.push('u.email = ?');
      params.push(options.user);
    }

    const sql = `
      SELECT ss.id AS search_id, ss.search_text, ss.enabled, ss.future_only,
             u.email, u.name, u.email_notifications_enabled, u.status_id
      FROM saved_searches ss
      JOIN users u ON ss.user_id = u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.email, ss.created_at
    `;

    const searches = await db.query(sql, params);

    if (searches.length === 0) {
      formatWarning(
        options.user ? `No saved searches found for ${options.user}.` : 'No saved searches found.'
      );
      process.exit(0);
    }

    const { today, tomorrow } = notificationWindow();
    console.log();
    formatInfo(`Previewing matches in the notification window: ${today} → ${tomorrow}`);
    console.log();

    const table = createTable(['Owner', 'Search', 'Enabled', 'Notify', 'Matches']);
    const verboseRows = [];

    for (const s of searches) {
      // runSearch() uses the same today+tomorrow window the scheduler uses,
      // honouring the search's future_only flag exactly as the matcher would.
      const matches = await notificationService.runSearch(s.search_text, !!s.future_only);
      // A search only feeds a notification if it's enabled, the user is active
      // (status_id 2) and has notifications on. Flag rows that wouldn't notify.
      const wouldNotify = s.enabled && s.email_notifications_enabled && s.status_id === 2;
      table.push([
        s.email,
        `"${s.search_text}"`,
        s.enabled ? 'yes' : 'no',
        s.email_notifications_enabled ? (s.status_id === 2 ? 'yes' : 'inactive') : 'no',
        matches.length + (matches.length && !wouldNotify ? ' (muted)' : '')
      ]);
      if (options.verbose && matches.length) {
        verboseRows.push({ search: s.search_text, email: s.email, matches });
      }
    }

    console.log(table.toString());
    console.log();
    formatSuccess(`${searches.length} saved search(es).`);

    if (options.verbose && verboseRows.length) {
      for (const row of verboseRows) {
        console.log();
        formatInfo(`"${row.search}" (${row.email}) — ${row.matches.length} match(es):`);
        for (const m of row.matches) {
          console.log(
            `  ${m.case_name} — ${m.list_date_formatted} ${m.hearing_time} @ ${m.court_room}`
          );
        }
      }
    }

    process.exit(0);
  } catch (error) {
    formatError(`Failed to list saved searches: ${error.message}`);
    process.exit(1);
  }
}

/**
 * `search preview-email <phrase>` — render the actual notification email for a
 * phrase (using the real Handlebars template + plain-text generator) without
 * sending it. Prints plain text by default; --html prints the HTML; --out
 * writes the HTML to a file.
 */
async function previewEmail(phrase, options) {
  try {
    if (!phrase || !phrase.trim()) {
      formatError(
        'A search phrase is required, e.g. cacd search preview-email "Criminal Cases Review Commission"'
      );
      process.exit(1);
    }

    // The notification matcher returns matches already shaped for the template.
    const matches = await notificationService.runSearch(phrase);
    const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
    const templateData = {
      userName: options.name || 'Preview User',
      searches: [{ searchText: stripSurroundingQuotes(phrase), matches }],
      matchCount: matches.length,
      baseUrl
    };

    // loadTemplates() only reads + compiles the .html files; it needs no SMTP
    // transporter, so it works in the CLI even when email is disabled.
    await emailService.loadTemplates();
    const html = emailService.templates.savedSearchMatches(templateData);
    const text = emailService.generatePlainTextSavedSearchMatches(templateData);

    if (options.out) {
      const fs = require('fs');
      fs.writeFileSync(options.out, html);
      formatSuccess(`HTML email written to ${options.out} (${matches.length} match(es)).`);
      process.exit(0);
    }

    if (options.html) {
      console.log(html);
      process.exit(0);
    }

    console.log();
    formatInfo(`Rendered email preview (${matches.length} match(es), not sent):`);
    console.log();
    console.log(text);
    process.exit(0);
  } catch (error) {
    formatError(`Failed to render email preview: ${error.message}`);
    process.exit(1);
  }
}

/**
 * `search notify` — exercise the saved-search notification pipeline.
 * Dry-run by default: reports who WOULD be notified and with what, sending
 * nothing and recording nothing. --send runs the real pipeline (after a
 * confirmation), exactly as the scheduler does.
 */
async function notify(options) {
  try {
    if (options.send) {
      const confirmed =
        options.yes ||
        (await confirm('This will send REAL notification emails to users. Continue?', false));
      if (!confirmed) {
        formatWarning('Aborted — no emails sent.');
        process.exit(0);
      }
      formatInfo('Running notification pipeline (real send)...');
      const stats = await notificationService.processSavedSearchNotifications();
      console.log();
      formatSuccess(
        `Done. Sent: ${stats.sent}  Skipped: ${stats.skipped}  Failed: ${stats.failed}`
      );
      process.exit(0);
    }

    // Dry run: mirror processSavedSearchNotifications without sending/recording.
    const active = await SavedSearch.getActiveSearchesForNotifications();
    const { today, tomorrow } = notificationWindow();

    console.log();
    formatInfo(`Dry run — notification window ${today} → ${tomorrow}. No emails will be sent.`);
    console.log();

    if (active.length === 0) {
      formatWarning('No active saved searches (enabled, notifications on, active users).');
      process.exit(0);
    }

    const byUser = notificationService.groupSearchesByUser(active);
    const table = createTable(['User', 'Matched searches', 'Total matches', 'Outcome']);
    let wouldSend = 0;

    for (const [userId, userData] of Object.entries(byUser)) {
      const canReceive = await SavedSearch.canReceiveNotification(parseInt(userId, 10));
      const results = await notificationService.runUserSearches(userData.searches);
      const withMatches = results.filter((r) => r.matches.length > 0);
      const total = withMatches.reduce((sum, r) => sum + r.matches.length, 0);

      let outcome;
      if (!canReceive) {
        outcome = 'skip (rate limited)';
      } else if (withMatches.length === 0) {
        outcome = 'skip (no matches)';
      } else {
        outcome = 'WOULD SEND';
        wouldSend++;
      }

      table.push([userData.email, String(withMatches.length), String(total), outcome]);
    }

    console.log(table.toString());
    console.log();
    formatSuccess(`${wouldSend} user(s) would be emailed. Run with --send to send for real.`);
    process.exit(0);
  } catch (error) {
    formatError(`Notification run failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { runSearch, savedSearches, previewEmail, notify };
