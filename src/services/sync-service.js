const { getConnection } = require('../config/database');
const { createRecordKey } = require('../scrapers/table-parser');
const logger = require('../utils/logger');

/**
 * Sync Service
 * Synchronizes scraped records with database using add/update/delete logic
 */

/**
 * Synchronize records for a specific list date and data source
 * @param {Array<Object>} newRecords - Newly scraped records
 * @param {string} listDate - Date of the list (YYYY-MM-DD)
 * @param {number} dataSourceId - Data source ID to scope operations
 * @returns {Promise<Object>} Sync statistics
 */
async function synchronizeRecords(newRecords, listDate, dataSourceId) {
  const connection = await getConnection();

  try {
    logger.info('Starting record synchronization', {
      listDate,
      dataSourceId,
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

    // Define operation arrays that will be accessible in catch block
    let toAdd = [];
    let toUpdate = [];
    let toDelete = [];

    try {
      // Get existing records for this date and source
      const [existingRows] = await connection.query(
        'SELECT * FROM hearings WHERE list_date = ? AND data_source_id = ?',
        [listDate, dataSourceId]
      );

      logger.debug('Retrieved existing records', {
        listDate,
        existingCount: existingRows.length
      });

      // Create key maps for comparison
      const newRecordMap = createKeyMap(deduplicatedRecords);
      const existingRecordMap = createKeyMap(existingRows);

      // Determine operations
      toAdd = [];
      toUpdate = [];
      toDelete = [];

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

      // Before inserting, handle cross-source conflicts (e.g. FHL records
      // that will clash with incoming DCL records on the unique_hearing key).
      // Carry forward crown_court from the conflicting record if the new one lacks it.
      if (toAdd.length > 0) {
        const conflictKeys = toAdd.map((r) => [r.listDate, r['case number'], r.time]);
        const conflictPlaceholders = conflictKeys.map(() => '(?, ?, ?)').join(', ');
        const conflictParams = conflictKeys.flat();

        const [conflictingRows] = await connection.query(
          `SELECT id, list_date, case_number, time, crown_court, data_source_id
           FROM hearings
           WHERE (list_date, case_number, time) IN (${conflictPlaceholders})
             AND data_source_id != ?`,
          [...conflictParams, dataSourceId]
        );

        if (conflictingRows.length > 0) {
          // Build lookup of crown_court values from conflicting records
          const crownCourtLookup = {};
          const idsToRemove = [];
          for (const row of conflictingRows) {
            const key = createRecordKey(row);
            if (row.crown_court) {
              crownCourtLookup[key] = row.crown_court;
            }
            idsToRemove.push(row.id);
          }

          // Carry forward crown_court to new records that lack it
          for (const record of toAdd) {
            const key = createRecordKey(record);
            if (!record['crown court'] && crownCourtLookup[key]) {
              record['crown court'] = crownCourtLookup[key];
            }
          }

          // Delete the conflicting records so the insert succeeds
          await connection.query(
            `DELETE FROM hearings WHERE id IN (${idsToRemove.map(() => '?').join(',')})`,
            idsToRemove
          );

          logger.info('Removed cross-source conflicting records', {
            listDate,
            removedCount: idsToRemove.length,
            crownCourtCarriedForward: Object.keys(crownCourtLookup).length
          });
        }
      }

      // Bulk insert new records
      if (toAdd.length > 0) {
        await bulkInsertRecords(connection, toAdd, dataSourceId);
        addedCount = toAdd.length;
      }

      // Update changed records (still individual — each has different values)
      for (const { new: newRecord, existing: existingRecord } of toUpdate) {
        await updateRecord(connection, newRecord, existingRecord.id);
        updatedCount++;
      }

      // Bulk delete removed records
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map((r) => r.id);
        await connection.query(
          `DELETE FROM hearings WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
          idsToDelete
        );
        deletedCount = toDelete.length;
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
        listDate,
        error: {
          message: error.message,
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage,
          sql: error.sql
        },
        stats: {
          newRecordCount: deduplicatedRecords.length,
          toAddCount: toAdd?.length || 0,
          toUpdateCount: toUpdate?.length || 0,
          toDeleteCount: toDelete?.length || 0
        }
      });
      console.error('Synchronization stack trace:');
      console.error(error);
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
 * Format date for MySQL DATETIME column
 * Converts JS Date or ISO string to 'YYYY-MM-DD HH:MM:SS' format
 * @param {Date|string} date - Date to format
 * @returns {string} MySQL datetime string
 */
function formatDateTimeForMySQL(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Bulk insert hearing records using multi-value INSERT
 * @param {Object} connection - Database connection
 * @param {Array<Object>} records - Records to insert
 * @param {number} dataSourceId - Data source ID
 * @param {number} batchSize - Max records per INSERT statement
 */
async function bulkInsertRecords(connection, records, dataSourceId, batchSize = 500) {
  const columns = `(list_date, case_number, time, hearing_datetime,
    venue, judge, case_details, hearing_type, additional_information,
    crown_court, reporting_restriction,
    division, data_source_id, source_url, scraped_at)`;
  const placeholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const placeholders = batch.map(() => placeholder).join(', ');
    const params = [];

    for (const record of batch) {
      params.push(
        record.listDate,
        record['case number'],
        record.time,
        record.hearingDateTime,
        record.venue || null,
        record.judge || null,
        record['case details'] || null,
        record['hearing type'] || null,
        record['additional information'] || null,
        record['crown court'] || null,
        record['reporting restriction'] || null,
        record.division,
        dataSourceId,
        record.sourceUrl,
        formatDateTimeForMySQL(record.scrapedAt)
      );
    }

    await connection.query(`INSERT INTO hearings ${columns} VALUES ${placeholders}`, params);
  }
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
      formatDateTimeForMySQL(record.scrapedAt),
      id
    ]
  );
}

/**
 * Full-replace synchronization for volatile sources (e.g. Future Hearing List).
 * Deletes all existing records for the given data source, then bulk inserts
 * new records using INSERT IGNORE to skip any that conflict with records
 * from a higher-precedence source (e.g. Daily Cause List).
 *
 * @param {Array<Object>} newRecords - Newly scraped records
 * @param {number} dataSourceId - Data source ID
 * @returns {Promise<Object>} Sync statistics
 */
async function fullReplaceSynchronize(newRecords, dataSourceId) {
  const connection = await getConnection();

  try {
    logger.info('Starting full-replace synchronization', {
      dataSourceId,
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
        dataSourceId,
        original: newRecords.length,
        deduplicated: deduplicatedRecords.length,
        duplicates: newRecords.length - deduplicatedRecords.length
      });
    }

    await connection.beginTransaction();

    try {
      // Count existing records before delete
      const [countResult] = await connection.query(
        'SELECT COUNT(*) as cnt FROM hearings WHERE data_source_id = ?',
        [dataSourceId]
      );
      const previousCount = countResult[0].cnt;

      // Delete all existing records for this source
      await connection.query('DELETE FROM hearings WHERE data_source_id = ?', [dataSourceId]);

      logger.info('Deleted existing records for full replace', {
        dataSourceId,
        deletedCount: previousCount
      });

      // Bulk insert with INSERT IGNORE to skip conflicts with other sources
      let addedCount = 0;
      if (deduplicatedRecords.length > 0) {
        addedCount = await bulkInsertIgnoreRecords(connection, deduplicatedRecords, dataSourceId);
      }

      const skippedCount = deduplicatedRecords.length - addedCount;

      await connection.commit();

      logger.info('Full-replace synchronization completed', {
        dataSourceId,
        previousCount,
        newRecordCount: deduplicatedRecords.length,
        added: addedCount,
        skipped: skippedCount
      });

      return {
        success: true,
        dataSourceId,
        added: addedCount,
        updated: 0,
        deleted: previousCount,
        skipped: skippedCount,
        total: deduplicatedRecords.length
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Full-replace synchronization failed, transaction rolled back', {
        dataSourceId,
        error: {
          message: error.message,
          code: error.code,
          sqlMessage: error.sqlMessage
        }
      });
      throw error;
    }
  } finally {
    connection.release();
  }
}

/**
 * Bulk insert with INSERT IGNORE (skips rows that violate unique constraints)
 * @param {Object} connection - Database connection
 * @param {Array<Object>} records - Records to insert
 * @param {number} dataSourceId - Data source ID
 * @param {number} batchSize - Max records per INSERT statement
 * @returns {Promise<number>} Number of rows actually inserted
 */
async function bulkInsertIgnoreRecords(connection, records, dataSourceId, batchSize = 500) {
  const columns = `(list_date, case_number, time, hearing_datetime,
    venue, judge, case_details, hearing_type, additional_information,
    crown_court, reporting_restriction,
    division, data_source_id, source_url, scraped_at)`;
  const placeholder = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

  let totalInserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const placeholders = batch.map(() => placeholder).join(', ');
    const params = [];

    for (const record of batch) {
      params.push(
        record.listDate,
        record['case number'],
        record.time,
        record.hearingDateTime,
        record.venue || null,
        record.judge || null,
        record['case details'] || null,
        record['hearing type'] || null,
        record['additional information'] || null,
        record['crown court'] || null,
        record['reporting restriction'] || null,
        record.division,
        dataSourceId,
        record.sourceUrl,
        formatDateTimeForMySQL(record.scrapedAt)
      );
    }

    const [result] = await connection.query(
      `INSERT IGNORE INTO hearings ${columns} VALUES ${placeholders}`,
      params
    );
    totalInserted += result.affectedRows;
  }

  return totalInserted;
}

module.exports = {
  synchronizeRecords,
  fullReplaceSynchronize,
  hasChanged,
  createKeyMap
};
