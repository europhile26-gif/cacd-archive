const cheerio = require('cheerio');
const logger = require('../utils/logger');
const emailService = require('../services/email-service');

/**
 * FHL Table Parser Module
 * Parses the "Court of Appeal cases fixed for hearing (Criminal Division)"
 * HTML table from GOV.UK.
 *
 * FHL columns: Surname, Forenames, CAO Reference number, Hearing Date,
 *              Court, Time, Reporting Restriction, Crown Court
 *
 * Mapping to hearings schema:
 *   Surname + Forenames  → case_details
 *   CAO Reference number → case_number
 *   Hearing Date         → list_date + hearingDateTime
 *   Court                → venue
 *   Time                 → time
 *   Reporting Restriction→ reporting_restriction
 *   Crown Court          → crown_court
 */

// Column name mappings — FHL header text (lowercased) to our internal field names
const COLUMN_MAP = {
  surname: 'surname',
  forenames: 'forenames',
  'cao reference number': 'case number',
  'hearing date': 'hearing date',
  court: 'venue',
  time: 'time',
  'reporting restriction': 'reporting restriction',
  'crown court': 'crown court'
};

// Months for date parsing
const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

/**
 * Parse FHL document table
 * @param {string} html - HTML document
 * @param {string} sourceUrl - Source URL
 * @param {string} division - Division (default: 'Criminal')
 * @returns {Promise<Array<Object>>} Array of parsed records
 */
async function parseFHLTable(html, sourceUrl, division = 'Criminal') {
  logger.info('Starting FHL table parsing');

  try {
    const $ = cheerio.load(html);

    // FHL tables don't have govuk-table class — find any table
    const table = $('table').first();
    if (table.length === 0) {
      throw new Error('No table found in FHL document');
    }

    // Extract headers
    const headers = [];
    const headerRow = table.find('thead tr').first();
    headerRow.find('th').each((i, cell) => {
      headers.push($(cell).text().trim().toLowerCase());
    });

    logger.debug('FHL headers extracted', { headers });

    // Map headers to column indices
    const columnIndices = {};
    for (const [headerText, fieldName] of Object.entries(COLUMN_MAP)) {
      const idx = headers.indexOf(headerText);
      if (idx !== -1) {
        columnIndices[fieldName] = idx;
      }
    }

    // Validate critical columns
    const critical = ['case number', 'time', 'hearing date'];
    const missing = critical.filter((col) => columnIndices[col] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `Critical FHL columns missing: ${missing.join(', ')}. Found headers: ${headers.join(', ')}`
      );
    }

    // Process rows
    const records = [];
    const rows = table.find('tbody tr');
    let rowNumber = 0;
    let skipped = 0;

    rows.each((i, row) => {
      rowNumber++;
      const cells = $(row).find('td');

      try {
        const record = parseFHLRow(cells, columnIndices, rowNumber);
        if (record) {
          // Enrich with metadata
          record.sourceUrl = sourceUrl;
          record.division = division;
          record.scrapedAt = new Date().toISOString();

          records.push(record);
        } else {
          skipped++;
        }
      } catch (error) {
        logger.warn(`Error parsing FHL row ${rowNumber}`, {
          error: error.message,
          rowNumber
        });
        skipped++;
      }
    });

    logger.info('FHL table parsing completed', {
      totalRows: rowNumber,
      validRecords: records.length,
      skipped
    });

    return records;
  } catch (error) {
    logger.error('FHL table parsing failed', { error: error.message });

    try {
      let htmlSample = null;
      if (html && html.length > 0) {
        htmlSample = html.substring(0, Math.min(html.length, 2000));
        if (html.length > 2000) htmlSample += '\n... (truncated)';
      }

      await emailService.sendDataError({
        type: 'fhl-table-parsing',
        error: error.message,
        stack: error.stack,
        date: new Date().toISOString().slice(0, 10),
        url: sourceUrl,
        htmlSample,
        context: { htmlLength: html ? html.length : 0 }
      });
    } catch (emailError) {
      logger.error('Failed to send FHL parsing error email', {
        error: emailError.message
      });
    }

    throw error;
  }
}

/**
 * Parse a single FHL table row
 * @param {Object} cells - Cheerio cells collection
 * @param {Object} columnIndices - Map of field name to column index
 * @param {number} rowNumber - Row number (1-based)
 * @returns {Object|null} Parsed record or null if invalid
 */
function parseFHLRow(cells, columnIndices, rowNumber) {
  const getCellText = (fieldName) => {
    const idx = columnIndices[fieldName];
    if (idx === undefined) return '';
    const cell = cells.eq(idx);
    return cell.length > 0
      ? cheerio
          .load(cell.html() || '')
          .text()
          .trim()
      : '';
  };

  const caseNumber = getCellText('case number');
  const time = getCellText('time');
  const hearingDateStr = getCellText('hearing date');

  // Validate critical fields
  if (!caseNumber || !time || !hearingDateStr) {
    logger.warn('FHL row missing critical fields', {
      rowNumber,
      hasCaseNumber: !!caseNumber,
      hasTime: !!time,
      hasHearingDate: !!hearingDateStr
    });
    return null;
  }

  // Validate time format
  if (!validateTime(time)) {
    logger.warn('FHL row has invalid time format', { rowNumber, time });
    return null;
  }

  // Parse hearing date (e.g. "1 April 2026" → "2026-04-01")
  const listDate = parseHearingDate(hearingDateStr);
  if (!listDate) {
    logger.warn('FHL row has unparseable hearing date', {
      rowNumber,
      hearingDate: hearingDateStr
    });
    return null;
  }

  // Validate case number (warning only)
  validateCaseNumber(caseNumber, rowNumber);

  // Build case details from Surname + Forenames
  const surname = getCellText('surname');
  const forenames = getCellText('forenames');
  const caseDetails = forenames ? `${surname}, ${forenames}` : surname;

  // Combine date + time
  const hearingDateTime = combineDateTime(listDate, time);

  return {
    listDate,
    'case number': caseNumber,
    time,
    hearingDateTime,
    venue: formatVenue(getCellText('venue')),
    judge: null, // FHL doesn't include judge
    'case details': caseDetails || null,
    'hearing type': null, // FHL doesn't include hearing type
    'additional information': null,
    'crown court': getCellText('crown court') || null,
    'reporting restriction': getCellText('reporting restriction') || null
  };
}

/**
 * Format venue value — if numeric (e.g. "7"), expand to "RCJ - Court 7"
 * @param {string} venue - Raw venue value
 * @returns {string|null} Formatted venue or null
 */
function formatVenue(venue) {
  if (!venue) return null;
  if (/^\d+$/.test(venue)) {
    return `RCJ - Court ${venue}`;
  }
  return venue;
}

/**
 * Parse a human-readable date string into YYYY-MM-DD
 * Handles: "1 April 2026", "12 March 2026"
 * @param {string} dateStr - Date string
 * @returns {string|null} YYYY-MM-DD or null if unparseable
 */
function parseHearingDate(dateStr) {
  const pattern = /^(\d{1,2})\s+(\w+)\s+(\d{4})$/;
  const match = dateStr.trim().match(pattern);

  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthName = match[2].toLowerCase();
  const year = parseInt(match[3], 10);

  const month = MONTHS[monthName];
  if (month === undefined) return null;

  // Basic validation
  if (day < 1 || day > 31) return null;
  if (year < 2020 || year > 2100) return null;

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Validate time format
 * @param {string} timeString - e.g. "10:30am", "10am"
 * @returns {boolean}
 */
function validateTime(timeString) {
  const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
  if (!pattern.test(timeString)) return false;

  const match = timeString.match(pattern);
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours < 1 || hours > 12) return false;
  if (minutes < 0 || minutes > 59) return false;

  return true;
}

/**
 * Validate case number format (warning only)
 * @param {string} caseNumber - Case number
 * @param {number} rowNumber - Row number
 */
function validateCaseNumber(caseNumber, rowNumber) {
  const pattern = /^\d{9}\s+[A-Z]\d+$/;
  if (!pattern.test(caseNumber)) {
    logger.warn('Unexpected FHL case number format', { caseNumber, rowNumber });
  }
}

/**
 * Combine date and time into ISO datetime
 * @param {string} listDate - YYYY-MM-DD
 * @param {string} timeString - e.g. "10:30am"
 * @returns {string} ISO datetime
 */
function combineDateTime(listDate, timeString) {
  const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
  const match = timeString.match(pattern);

  if (!match) throw new Error(`Invalid time format: ${timeString}`);

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3].toLowerCase();

  if (period === 'pm' && hours !== 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  const hoursStr = hours.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');

  return `${listDate}T${hoursStr}:${minutesStr}:00`;
}

module.exports = {
  parseFHLTable,
  parseFHLRow,
  parseHearingDate,
  validateTime,
  combineDateTime
};
