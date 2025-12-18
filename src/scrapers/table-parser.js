const cheerio = require('cheerio');
const logger = require('../utils/logger');
const emailService = require('../services/email-service');

/**
 * Table Parser Module
 * Parses Court of Appeal daily cause list HTML tables
 * with cell inheritance logic and validation.
 */

const INHERITABLE_COLUMNS = ['venue', 'judge'];

/**
 * Parse daily cause list table from HTML
 * @param {string} html - HTML document
 * @param {string} listDate - Date of the list (YYYY-MM-DD)
 * @param {string} sourceUrl - Source URL
 * @param {string} division - Division (Criminal/Civil)
 * @returns {Promise<Array<Object>>} Array of parsed records
 */
async function parseTable(html, listDate, sourceUrl, division = 'Criminal') {
  logger.info('Starting table parsing', { listDate, division });

  try {
    const $ = cheerio.load(html);

    // Find the table
    const table = $('table.govuk-table').first();
    if (table.length === 0) {
      throw new Error('Table with class "govuk-table" not found in document');
    }

    // Check for multiple tables
    const tableCount = $('table.govuk-table').length;
    if (tableCount > 1) {
      logger.warn(`Multiple tables found (${tableCount}), using first table`);
    }

    // Extract and validate headers
    const headers = extractHeaders(table);
    validateHeaders(headers);

    // Get table body rows
    const tbody = table.find('tbody');
    const rows = tbody.find('tr.govuk-table__row');

    logger.debug(`Found ${rows.length} rows in table body`);

    if (rows.length === 0) {
      logger.info('Table is empty, no hearings scheduled', { listDate });
      return [];
    }

    // Process rows
    const records = [];
    const lastValues = {}; // Track last seen value for each column
    let rowNumber = 0;

    rows.each((i, row) => {
      rowNumber++;
      const cells = $(row).find('td.govuk-table__cell');

      try {
        const record = parseRow(cells, headers, lastValues, rowNumber);

        // Validate record
        if (validateRecord(record, rowNumber)) {
          // Enrich with metadata
          record.listDate = listDate;
          record.sourceUrl = sourceUrl;
          record.division = division;
          record.scrapedAt = new Date().toISOString();

          // Combine time + date to create datetime
          record.hearingDateTime = combineDateTime(listDate, record.time);

          records.push(record);

          // Update last values for inheritable columns
          updateLastValues(lastValues, record);
        }
      } catch (error) {
        logger.error(`Error parsing row ${rowNumber}`, {
          error: error.message,
          rowNumber
        });
      }
    });

    logger.info('Table parsing completed', {
      listDate,
      totalRows: rowNumber,
      validRecords: records.length
    });

    return records;
  } catch (error) {
    logger.error('Table parsing failed', {
      error: error.message,
      listDate
    });

    // Send email alert for table parsing failure
    try {
      // Extract HTML sample if available
      let htmlSample = null;
      if (html && html.length > 0) {
        const sampleLength = Math.min(html.length, 2000);
        htmlSample = html.substring(0, sampleLength);
        if (html.length > 2000) {
          htmlSample += '\n... (truncated)';
        }
      }

      await emailService.sendDataError({
        type: 'table-parsing',
        error: error.message,
        stack: error.stack,
        date: listDate,
        url: sourceUrl,
        htmlSample,
        context: {
          division,
          htmlLength: html ? html.length : 0
        }
      });
    } catch (emailError) {
      logger.error('Failed to send table parsing error email', {
        error: emailError.message
      });
    }

    throw error;
  }
}

/**
 * Extract column headers from table
 * @param {Object} table - Cheerio table element
 * @returns {Array<string>} Normalized header names
 */
function extractHeaders(table) {
  const headers = [];
  const headerRow = table.find('thead tr.govuk-table__row').first();
  const headerCells = headerRow.find('th.govuk-table__header');

  headerCells.each((i, cell) => {
    const text = cheerio.load(cell).text().trim().toLowerCase();
    headers.push(text);
  });

  logger.debug('Extracted headers', { headers });
  return headers;
}

/**
 * Validate table headers match expected structure
 * @param {Array<string>} headers - Header names
 * @throws {Error} If critical headers are missing
 */
function validateHeaders(headers) {
  const headerMap = mapHeaders(headers);

  const criticalColumns = ['time', 'case number'];
  const missing = [];

  for (const col of criticalColumns) {
    if (headerMap[col] === undefined) {
      missing.push(col);
    }
  }

  if (missing.length > 0) {
    const error = `Critical columns missing from table: ${missing.join(', ')}`;
    logger.error('Table structure validation failed', {
      missing,
      found: headers
    });
    throw new Error(error);
  }

  logger.debug('Header validation passed', { headerMap });
}

/**
 * Map headers to standard column names by text matching
 * @param {Array<string>} headers - Raw header names
 * @returns {Object} Map of column name to index
 */
function mapHeaders(headers) {
  const map = {};

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();

    // Match header by text content (flexible matching)
    if (normalized.includes('venue')) {
      map.venue = index;
    } else if (normalized.includes('judge')) {
      map.judge = index;
    } else if (normalized.includes('time')) {
      map.time = index;
    } else if (normalized.includes('case') && normalized.includes('number')) {
      map['case number'] = index;
    } else if (normalized.includes('case') && normalized.includes('detail')) {
      map['case details'] = index;
    } else if (normalized.includes('hearing') && normalized.includes('type')) {
      map['hearing type'] = index;
    } else if (normalized.includes('additional') || normalized.includes('information')) {
      map['additional information'] = index;
    }
  });

  return map;
}

/**
 * Parse a single table row with cell inheritance
 * @param {Object} cells - Cheerio cells collection
 * @param {Array<string>} headers - Header names
 * @param {Object} lastValues - Last seen values for inheritance
 * @param {number} rowNumber - Row number (1-based)
 * @returns {Object} Parsed record
 */
function parseRow(cells, headers, lastValues, rowNumber) {
  const record = {};
  const headerMap = mapHeaders(headers);

  cells.each((i, cell) => {
    const cellText = cheerio.load(cell).text().trim();
    let columnName = null;

    // Find column name by index
    for (const [name, index] of Object.entries(headerMap)) {
      if (index === i) {
        columnName = name;
        break;
      }
    }

    if (!columnName) {
      // Unknown column, skip
      return;
    }

    // Check if cell is empty
    if (!cellText || cellText.length === 0) {
      // Apply inheritance if column supports it
      if (INHERITABLE_COLUMNS.includes(columnName)) {
        if (lastValues[columnName]) {
          record[columnName] = lastValues[columnName];
        } else if (rowNumber === 1) {
          throw new Error(`First row has empty cell in column: ${columnName}`);
        } else {
          record[columnName] = null;
        }
      } else {
        record[columnName] = '';
      }
    } else {
      // Cell has content
      record[columnName] = cellText;
    }
  });

  return record;
}

/**
 * Validate parsed record
 * @param {Object} record - Parsed record
 * @param {number} rowNumber - Row number
 * @returns {boolean} True if valid
 */
function validateRecord(record, rowNumber) {
  // Critical fields must be present
  if (!record.time || record.time.trim().length === 0) {
    logger.warn('Record missing time field', { rowNumber });
    return false;
  }

  if (!record['case number'] || record['case number'].trim().length === 0) {
    logger.warn('Record missing case number', { rowNumber });
    return false;
  }

  // Validate time format
  if (!validateTime(record.time)) {
    logger.error('Invalid time format', {
      time: record.time,
      rowNumber
    });
    return false;
  }

  // Validate case number (warning only)
  validateCaseNumber(record['case number'], rowNumber);

  return true;
}

/**
 * Validate time field format
 * @param {string} timeString - Time string (e.g., "10:30am", "10am")
 * @returns {boolean}
 */
function validateTime(timeString) {
  // Expected formats: "10:30am", "2:00pm", "10:30 am", "10am", "2pm"
  const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;

  if (!pattern.test(timeString)) {
    return false;
  }

  const match = timeString.match(pattern);
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  // Validate ranges
  if (hours < 1 || hours > 12) return false;
  if (minutes < 0 || minutes > 59) return false;

  return true;
}

/**
 * Validate case number format (logs warning only)
 * @param {string} caseNumber - Case number
 * @param {number} rowNumber - Row number
 */
function validateCaseNumber(caseNumber, rowNumber) {
  // Expected format: "202403891 A1"
  const pattern = /^\d{9}\s+[A-Z]\d+$/;

  if (!pattern.test(caseNumber)) {
    logger.warn('Unexpected case number format', {
      caseNumber,
      rowNumber
    });
  }
}

/**
 * Combine date and time into ISO datetime
 * @param {string} listDate - Date (YYYY-MM-DD)
 * @param {string} timeString - Time (e.g., "10:30am", "10am")
 * @returns {string} ISO datetime string
 */
function combineDateTime(listDate, timeString) {
  // Parse time string
  const pattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;
  const match = timeString.match(pattern);

  if (!match) {
    throw new Error(`Invalid time format: ${timeString}`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3].toLowerCase();

  // Convert to 24-hour format
  if (period === 'pm' && hours !== 12) {
    hours += 12;
  }
  if (period === 'am' && hours === 12) {
    hours = 0;
  }

  // Construct datetime
  const hoursStr = hours.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');

  return `${listDate}T${hoursStr}:${minutesStr}:00`;
}

/**
 * Update last values for inheritable columns
 * @param {Object} lastValues - Last values object
 * @param {Object} record - Current record
 */
function updateLastValues(lastValues, record) {
  for (const col of INHERITABLE_COLUMNS) {
    if (record[col]) {
      lastValues[col] = record[col];
    }
  }
}

/**
 * Create composite key for a record
 * Handles both new scraped records and database records
 * @param {Object} record - Record object
 * @returns {string} Composite key
 */
function createRecordKey(record) {
  // Handle both camelCase/snake_case and spaces in field names
  let listDate = record.listDate || record.list_date;
  const caseNumber = record['case number'] || record.case_number || record.caseNumber;
  const time = record.time;

  // If listDate is a Date object, format it as YYYY-MM-DD
  if (listDate instanceof Date) {
    const year = listDate.getFullYear();
    const month = String(listDate.getMonth() + 1).padStart(2, '0');
    const day = String(listDate.getDate()).padStart(2, '0');
    listDate = `${year}-${month}-${day}`;
  }

  return `${listDate}|${caseNumber}|${time}`;
}

module.exports = {
  parseTable,
  validateTime,
  validateCaseNumber,
  combineDateTime,
  createRecordKey,
  extractHeaders,
  mapHeaders
};
