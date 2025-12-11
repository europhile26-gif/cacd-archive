const { getConnection } = require('../config/database');
const { createRecordKey } = require('../scrapers/table-parser');
const logger = require('../utils/logger');

/**
 * Sync Service
 * Synchronizes scraped records with database using add/update/delete logic
 */

/**
 * Synchronize records for a specific list date
 * @param {Array<Object>} newRecords - Newly scraped records
 * @param {string} listDate - Date of the list (YYYY-MM-DD)
 * @returns {Promise<Object>} Sync statistics
 */
async function synchronizeRecords(newRecords, listDate) {
  const connection = await getConnection();

  try {
    logger.info('Starting record synchronization', {
      listDate,
      newRecordCount: newRecords.length
    });

    // Deduplicate new records (keep last occurrence)
    const deduplicatedMap = {};
    for (const record of newRecords) {
      const key = createRecordKey(record);
      deduplicatedMap[key] = record;
    }
    const deduplicatedRecords = Object.values(deduplicatedMap);

    if (deduplicatedRecords.length < newRecords.length) {
      logger.warn('Duplicate records found in scraped data', {
        listDate,
        original: newRecords.length,
        deduplicated: deduplicatedRecords.length,
        duplicates: newRecords.length - deduplicatedRecords.length
      });
    }

    await connection.beginTransaction();

    try {
      // Get existing records for this date
      const [existingRows] = await connection.query(
        'SELECT * FROM hearings WHERE list_date = ?',
        [listDate]
      );

      logger.debug('Retrieved existing records', {
        listDate,
        existingCount: existingRows.length
      });

      // Create key maps for comparison
      const newRecordMap = createKeyMap(deduplicatedRecords);
      const existingRecordMap = createKeyMap(existingRows);

      // Determine operations
      const toAdd = [];
      const toUpdate = [];
      const toDelete = [];

      // Find additions and updates
      for (const [key, newRecord] of Object.entries(newRecordMap)) {
        if (!existingRecordMap[key]) {
          // New record - add
          toAdd.push(newRecord);
        } else {
          // Existing record - check if changed
          const existingRecord = existingRecordMap[key];
          if (hasChanged(newRecord, existingRecord)) {
            toUpdate.push({ new: newRecord, existing: existingRecord });
          }
        }
      }

      // Find deletions (records in DB but not in new scrape)
      for (const [key, existingRecord] of Object.entries(existingRecordMap)) {
        if (!newRecordMap[key]) {
          toDelete.push(existingRecord);
        }
      }

      logger.info('Sync analysis complete', {
        listDate,
        toAdd: toAdd.length,
        toUpdate: toUpdate.length,
        toDelete: toDelete.length
      });

      // Execute operations
      let addedCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;

      // Insert new records
      for (const record of toAdd) {
        await insertRecord(connection, record);
        addedCount++;
      }

      // Update changed records
      for (const { new: newRecord, existing: existingRecord } of toUpdate) {
        await updateRecord(connection, newRecord, existingRecord.id);
        updatedCount++;
      }

      // Delete removed records (hard delete)
      for (const record of toDelete) {
        await deleteRecord(connection, record.id);
        deletedCount++;
      }

      await connection.commit();

      logger.info('Synchronization completed successfully', {
        listDate,
        added: addedCount,
        updated: updatedCount,
        deleted: deletedCount
      });

      return {
        success: true,
        listDate,
        added: addedCount,
        updated: updatedCount,
        deleted: deletedCount,
        total: deduplicatedRecords.length
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Synchronization failed, transaction rolled back', {
        error: error.message,
        stack: error.stack,
        listDate
      });
      throw error;
    }
  } finally {
    connection.release();
  }
}

/**
 * Create a map of records keyed by composite key
 * @param {Array<Object>} records - Array of records
 * @returns {Object} Map of key -> record
 */
function createKeyMap(records) {
  const map = {};
  for (const record of records) {
    const key = createRecordKey(record);
    map[key] = record;
  }
  return map;
}

/**
 * Check if record has changed (compare relevant fields)
 * @param {Object} newRecord - New record
 * @param {Object} existingRecord - Existing record
 * @returns {boolean}
 */
function hasChanged(newRecord, existingRecord) {
  // Compare key fields that might change
  const fieldsToCompare = [
    'venue',
    'judge',
    'caseDetails',
    'hearingType',
    'additionalInformation',
    'hearingDateTime'
  ];

  for (const field of fieldsToCompare) {
    const newValue = normalizeValue(newRecord[field]);
    const existingValue = normalizeValue(
      field === 'caseDetails'
        ? existingRecord.case_details
        : field === 'hearingType'
          ? existingRecord.hearing_type
          : field === 'additionalInformation'
            ? existingRecord.additional_information
            : field === 'hearingDateTime'
              ? existingRecord.hearing_datetime
              : existingRecord[field]
    );

    if (newValue !== existingValue) {
      logger.debug('Field changed', {
        field,
        old: existingValue,
        new: newValue
      });
      return true;
    }
  }

  return false;
}

/**
 * Normalize value for comparison
 * @param {*} value - Value to normalize
 * @returns {string}
 */
function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/**
 * Insert new hearing record
 * @param {Object} connection - Database connection
 * @param {Object} record - Record to insert
 */
async function insertRecord(connection, record) {
  await connection.query(
    `INSERT INTO hearings (
      list_date, case_number, time, hearing_datetime,
      venue, judge, case_details, hearing_type, additional_information,
      division, source_url, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.listDate,
      record['case number'],
      record.time,
      record.hearingDateTime,
      record.venue || null,
      record.judge || null,
      record['case details'] || null,
      record['hearing type'] || null,
      record['additional information'] || null,
      record.division,
      record.sourceUrl,
      record.scrapedAt
    ]
  );
}

/**
 * Update existing hearing record
 * @param {Object} connection - Database connection
 * @param {Object} record - New record data
 * @param {number} id - Record ID to update
 */
async function updateRecord(connection, record, id) {
  await connection.query(
    `UPDATE hearings SET
      hearing_datetime = ?,
      venue = ?,
      judge = ?,
      case_details = ?,
      hearing_type = ?,
      additional_information = ?,
      source_url = ?,
      scraped_at = ?
    WHERE id = ?`,
    [
      record.hearingDateTime,
      record.venue || null,
      record.judge || null,
      record['case details'] || null,
      record['hearing type'] || null,
      record['additional information'] || null,
      record.sourceUrl,
      record.scrapedAt,
      id
    ]
  );
}

/**
 * Delete hearing record (hard delete)
 * @param {Object} connection - Database connection
 * @param {number} id - Record ID to delete
 */
async function deleteRecord(connection, id) {
  await connection.query('DELETE FROM hearings WHERE id = ?', [id]);
}

module.exports = {
  synchronizeRecords,
  hasChanged,
  createKeyMap
};
