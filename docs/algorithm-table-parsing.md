# Algorithm: Table Parsing

**Document:** Daily Cause List Table Parsing Algorithm  
**Related Requirements:** FR-003, FR-004, FR-007  
**Version:** 1.0  
**Date:** 11 December 2025

---

## 1. Overview

This document describes the algorithm for parsing the daily cause list table from a Court of Appeal (Criminal Division) HTML document and extracting structured data for storage.

**Input:** HTML document containing daily cause list  
**Output:** Array of structured case records ready for database insertion

**Example URL:**  
`https://www.court-tribunal-hearings.service.gov.uk/court-of-appeal-criminal-daily-cause-list?artefactId=debd7ee7-b06b-48c8-91b8-b82053dc53a7`

---

## 2. Table Structure

### 2.1 Observed HTML Structure

```html
<table class="govuk-table overflow-table">
  <thead class="govuk-table__head">
    <tr class="govuk-table__row">
      <th scope="col" class="govuk-table__header">Venue</th>
      <th scope="col" class="govuk-table__header">Judge</th>
      <th scope="col" class="govuk-table__header">Time</th>
      <th scope="col" class="govuk-table__header">Case number</th>
      <th scope="col" class="govuk-table__header">Case details</th>
      <th scope="col" class="govuk-table__header">Hearing type</th>
      <th scope="col" class="govuk-table__header">Additional information</th>
    </tr>
  </thead>
  <tbody class="govuk-table__body">
    <tr class="govuk-table__row">
      <td class="govuk-table__cell">RCJ - Court 5</td>
      <td class="govuk-table__cell">Lord Justice Males, Mr Justice Pepperall...</td>
      <td class="govuk-table__cell">10:30am</td>
      <td class="govuk-table__cell">202403891 A1</td>
      <td class="govuk-table__cell">R v ZDX</td>
      <td class="govuk-table__cell">FC Application Sentence</td>
      <td class="govuk-table__cell">1992 Sexual Offences Act applies</td>
    </tr>
    <tr class="govuk-table__row">
      <td class="govuk-table__cell"></td>
      <!-- Empty: inherit from previous row -->
      <td class="govuk-table__cell"></td>
      <!-- Empty: inherit from previous row -->
      <td class="govuk-table__cell">10:30am</td>
      <td class="govuk-table__cell">202503277 A5</td>
      <td class="govuk-table__cell">Robert McCalla</td>
      <td class="govuk-table__cell">Reference by the Attorney General...</td>
      <td class="govuk-table__cell">Pre-con in Booth 2 at 10:15am.</td>
    </tr>
    <!-- Additional rows... -->
  </tbody>
</table>
```

### 2.2 Column Definitions

| Column # | Header                 | Description                                   | Key Field | Inheritable |
| -------- | ---------------------- | --------------------------------------------- | --------- | ----------- |
| 1        | Venue                  | Court room location (e.g., "RCJ - Court 5")   | No        | Yes         |
| 2        | Judge                  | Judge(s) presiding                            | No        | Yes         |
| 3        | Time                   | Hearing time (e.g., "10:30am")                | **Yes**   | No          |
| 4        | Case number            | Unique case identifier (e.g., "202403891 A1") | **Yes**   | No          |
| 5        | Case details           | Case name or description                      | No        | No          |
| 6        | Hearing type           | Type of hearing                               | No        | No          |
| 7        | Additional information | Notes and restrictions                        | No        | No          |

**Key Fields:** Time + Case number (combined with document date) = Unique record identifier

### 2.3 Cell Inheritance Pattern

**Rule:** When a cell is empty, inherit the value from the same column in the previous row.

**Important Constraints:**

- Only certain columns can have empty cells (Venue, Judge)
- Key columns (Time, Case number) are **never** empty
- First row in table body must have all cells populated (no inheritance possible)

---

## 3. Parsing Algorithm

### 3.1 High-Level Steps

```
INPUT:
  - HTML document
  - Date of the list (e.g., "2025-12-11")
  - Source URL

OUTPUT:
  - Array of case records

STEPS:
1. Load HTML into DOM parser
2. Extract metadata (title, publication date if available)
3. Locate primary table
4. Extract column headers and validate structure
5. Iterate through table body rows
6. Apply cell inheritance logic
7. Parse and validate each row
8. Combine time with date to create datetime
9. Return structured records
```

### 3.2 Detailed Pseudocode

```javascript
FUNCTION parseTable(htmlDocument, listDate, sourceUrl)
    // Initialize parser
    dom = loadHTML(htmlDocument)

    // Find the table
    table = dom.querySelector('table.govuk-table')
    IF table IS NULL THEN
        THROW Error("Table not found in document")
    END IF

    // Extract and validate headers
    headers = extractHeaders(table)
    validateHeaders(headers)

    // Get table body rows
    tbody = table.querySelector('tbody')
    rows = tbody.querySelectorAll('tr.govuk-table__row')

    // Initialize tracking variables
    records = []
    lastValues = {}  // Track last seen value for each column
    rowNumber = 0

    // Process each row
    FOR EACH row IN rows
        rowNumber++
        cells = row.querySelectorAll('td.govuk-table__cell')

        // Parse row with inheritance
        record = parseRow(cells, headers, lastValues, rowNumber)

        // Validate record
        IF validateRecord(record) THEN
            // Enrich record with metadata
            record.listDate = listDate
            record.sourceUrl = sourceUrl
            record.scrapedAt = getCurrentTimestamp()

            // Combine time + date to create datetime
            record.hearingDateTime = combineDateTime(listDate, record.time)

            records.append(record)

            // Update last values for inheritance
            updateLastValues(lastValues, record, INHERITABLE_COLUMNS)
        ELSE
            LOG_WARNING("Row " + rowNumber + " validation failed")
        END IF
    END FOR

    RETURN records
END FUNCTION
```

### 3.3 Row Parsing with Inheritance

```javascript
FUNCTION parseRow(cells, headers, lastValues, rowNumber)
    record = {}

    FOR i = 0 TO cells.length - 1
        columnName = headers[i]
        cellText = cells[i].textContent.trim()

        // Check if cell is empty
        IF cellText IS EMPTY THEN
            // Apply inheritance if column supports it
            IF columnName IN INHERITABLE_COLUMNS THEN
                IF columnName IN lastValues THEN
                    record[columnName] = lastValues[columnName]
                ELSE
                    // First row cannot have empty inheritable cells
                    IF rowNumber == 1 THEN
                        THROW Error("First row has empty cell in column: " + columnName)
                    END IF
                    record[columnName] = null
                END IF
            ELSE
                // Non-inheritable column is empty
                record[columnName] = ""
            END IF
        ELSE
            // Cell has content
            record[columnName] = cellText
        END IF
    END FOR

    RETURN record
END FUNCTION

INHERITABLE_COLUMNS = ["venue", "judge"]
```

---

## 4. Data Validation and Transformation

### 4.1 Field Validation

**Time Field:**

```javascript
FUNCTION validateTime(timeString)
    // Expected formats: "10:30am", "2:00pm", "10:30 am"
    pattern = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i

    IF NOT matches(timeString, pattern) THEN
        RETURN false
    END IF

    // Extract components
    match = extract(timeString, pattern)
    hours = parseInt(match[1])
    minutes = parseInt(match[2])
    period = match[3].toLowerCase()

    // Validate ranges
    IF hours < 1 OR hours > 12 THEN RETURN false
    IF minutes < 0 OR minutes > 59 THEN RETURN false

    RETURN true
END FUNCTION
```

**Case Number Field:**

```javascript
FUNCTION validateCaseNumber(caseNumber)
    // Expected format: "202403891 A1", "202503277 A5"
    // Pattern: YYYYNNNNN XN (year + 5 digits + space + letter + digit)

    pattern = /^\d{9}\s+[A-Z]\d+$/

    IF NOT matches(caseNumber, pattern) THEN
        LOG_WARNING("Unexpected case number format: " + caseNumber)
        // Don't reject, but log for review
    END IF

    RETURN true  // Accept all non-empty case numbers
END FUNCTION
```

**Record Validation:**

```javascript
FUNCTION validateRecord(record)
    // Critical fields must be present and valid
    IF record.time IS NULL OR record.time IS EMPTY THEN
        RETURN false
    END IF

    IF record.caseNumber IS NULL OR record.caseNumber IS EMPTY THEN
        RETURN false
    END IF

    IF NOT validateTime(record.time) THEN
        LOG_ERROR("Invalid time format: " + record.time)
        RETURN false
    END IF

    validateCaseNumber(record.caseNumber)  // Logs warnings but doesn't fail

    RETURN true
END FUNCTION
```

### 4.2 DateTime Construction

```javascript
FUNCTION combineDateTime(listDate, timeString)
    // listDate format: "2025-12-11" (ISO 8601)
    // timeString format: "10:30am"

    // Parse time string
    pattern = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i
    match = extract(timeString, pattern)

    hours = parseInt(match[1])
    minutes = parseInt(match[2])
    period = match[3].toLowerCase()

    // Convert to 24-hour format
    IF period == "pm" AND hours != 12 THEN
        hours = hours + 12
    END IF

    IF period == "am" AND hours == 12 THEN
        hours = 0
    END IF

    // Construct datetime in ISO 8601 format
    datetime = listDate + "T" +
               padZero(hours, 2) + ":" +
               padZero(minutes, 2) + ":00"

    RETURN datetime  // e.g., "2025-12-11T10:30:00"
END FUNCTION

FUNCTION padZero(num, width)
    str = toString(num)
    WHILE length(str) < width
        str = "0" + str
    END WHILE
    RETURN str
END FUNCTION
```

---

## 5. Record Structure

### 5.1 Parsed Record Schema

```javascript
{
  // Primary key components
  "listDate": "2025-12-11",           // Date of the list (ISO 8601)
  "caseNumber": "202403891 A1",       // Case identifier
  "time": "10:30am",                  // Hearing time (original format)
  "hearingDateTime": "2025-12-11T10:30:00",  // Combined datetime (ISO 8601)

  // Case information
  "venue": "RCJ - Court 5",           // Court room
  "judge": "Lord Justice Males, Mr Justice Pepperall and Her Honour Judge Munro KC",
  "caseDetails": "R v ZDX",           // Case name/parties
  "hearingType": "FC Application Sentence",
  "additionalInformation": "1992 Sexual Offences Act applies",

  // Metadata
  "sourceUrl": "https://www.court-tribunal-hearings.service.gov.uk/...",
  "scrapedAt": "2025-12-11T14:23:45Z",  // When this record was scraped
  "scrapedVersion": 1                    // Incremented on each re-scrape of same date
}
```

### 5.2 Composite Key for Deduplication

**Unique Record Identifier:**

```
listDate + caseNumber + time
```

**Example:** `"2025-12-11|202403891 A1|10:30am"`

**Rationale:**

- Same case can appear on multiple dates (different hearings)
- Multiple cases can have same time (different courts)
- Same case might appear multiple times same day (unlikely but possible)

---

## 6. Edge Cases and Error Handling

### 6.1 Edge Cases

**Case 1: Empty Table**

- **Scenario:** No hearings scheduled (weekends, holidays)
- **Handling:** Return empty array, log INFO message, do not send alert email
- **Expected:** Table exists but tbody is empty or has no rows
- **Note:** This is a normal condition, not an error

**Case 2: Malformed Table Structure**

- **Scenario:** Missing columns, unexpected headers
- **Handling:**
  - Map headers by name (case-insensitive, whitespace-normalized) rather than position
  - If any required columns are missing, send email alert and abort parsing
  - Log critical error with details of missing columns
  - Do not attempt partial parsing if structure is invalid

**Case 3: Multiple Tables**

- **Scenario:** Document contains multiple tables
- **Handling:**
  - Select table with class `govuk-table`
  - If multiple found, take first one
  - Log warning if multiple tables detected

**Case 4: Inconsistent Inheritance**

- **Scenario:** Empty cells in middle of table without previous value
- **Handling:**
  - Use null/empty value
  - Log warning
  - Continue processing (don't fail entire parse)

**Case 5: Malformed Time Values**

- **Scenario:** "10:30", "1030am", "10.30am", "TBC"
- **Handling:**
  - Attempt flexible parsing for common variations
  - Log error and skip row if unparseable
  - Store original value for manual review

**Case 6: Long Text Fields**

- **Scenario:** Very long judge names, case details, or notes
- **Handling:** Accept as-is, ensure database fields are sized appropriately (TEXT vs VARCHAR)

**Case 7: Special Characters**

- **Scenario:** Unicode characters, HTML entities (&amp;, &quot;)
- **Handling:**
  - HTML parser should decode entities automatically
  - Store UTF-8 encoded text
  - Preserve special characters (é, ñ, etc.)

**Case 8: Whitespace Variations**

- **Scenario:** Extra spaces, tabs, newlines within cells
- **Handling:** Trim and normalize whitespace but preserve intentional formatting

### 6.2 Error Recovery

```javascript
FUNCTION parseTableWithErrorRecovery(html, listDate, sourceUrl)
    TRY
        records = parseTable(html, listDate, sourceUrl)
        RETURN { success: true, records: records, errors: [] }
    CATCH ParseError AS e
        LOG_ERROR("Critical parse error: " + e.message)
        RETURN { success: false, records: [], errors: [e] }
    CATCH ValidationError AS e
        LOG_WARNING("Validation error: " + e.message)
        // Return partial results if available
        RETURN { success: false, records: [], errors: [e] }
    END TRY
END FUNCTION
```

---

## 7. Database Synchronization

### 7.1 Insert/Update/Delete Logic

When processing a re-scrape of the same date:

```javascript
FUNCTION synchronizeRecords(newRecords, listDate, division)
    // Get existing records for this date
    existingRecords = database.query(
        "SELECT * FROM hearings WHERE list_date = ? AND division = ?",
        [listDate, division]
    )

    // Create lookup maps
    existingMap = createKeyMap(existingRecords)
    newMap = createKeyMap(newRecords)

    // Find additions, updates, deletions
    toAdd = []
    toUpdate = []
    toDelete = []

    // Check for new and updated records
    FOR EACH newRecord IN newRecords
        key = createRecordKey(newRecord)

        IF key NOT IN existingMap THEN
            toAdd.append(newRecord)
        ELSE
            existingRecord = existingMap[key]
            IF recordsAreDifferent(existingRecord, newRecord) THEN
                toUpdate.append(newRecord)
            END IF
        END IF
    END FOR

    // Check for deleted records
    FOR EACH existingRecord IN existingRecords
        key = createRecordKey(existingRecord)

        IF key NOT IN newMap THEN
            toDelete.append(existingRecord)
        END IF
    END FOR

    // Execute synchronization
    database.beginTransaction()
    TRY
        FOR EACH record IN toAdd
            database.insert(record)
        END FOR

        FOR EACH record IN toUpdate
            database.update(record)
        END FOR

        FOR EACH record IN toDelete
            database.hardDelete(record)  // Permanently remove stale records
        END FOR

        database.commit()

        RETURN {
            added: length(toAdd),
            updated: length(toUpdate),
            deleted: length(toDelete)
        }
    CATCH DatabaseError AS e
        database.rollback()
        THROW e
    END TRY
END FUNCTION

FUNCTION createRecordKey(record)
    RETURN record.listDate + "|" + record.caseNumber + "|" + record.time
END FUNCTION

FUNCTION createKeyMap(records)
    map = {}
    FOR EACH record IN records
        key = createRecordKey(record)
        map[key] = record
    END FOR
    RETURN map
END FUNCTION
```

### 7.2 Hard Delete Strategy

**Decision: Hard Delete**

When a record is removed from the daily cause list (e.g., a hearing time changes from 2pm to 3pm, the old 2pm record is removed and a new 3pm record appears), the stale record should be **permanently deleted** from the database.

**Rationale:**

- The database should reflect the current state of published hearings only
- Changed times create new records, old times are no longer valid
- Simplifies queries (no need to filter out deleted records)
- Storage efficiency

**Implementation:**

- Records not found in current scrape are DELETE'd
- No soft delete columns needed
- Audit trail can be maintained in logs if required

---

## 8. Database Schema

### 8.1 Proposed Table Structure

```sql
CREATE TABLE hearings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- Composite key components
    list_date DATE NOT NULL,
    case_number VARCHAR(50) NOT NULL,
    time VARCHAR(20) NOT NULL,

    -- Datetime for sorting/filtering
    hearing_datetime DATETIME NOT NULL,

    -- Case information
    venue VARCHAR(255),
    judge TEXT,
    case_details TEXT,
    hearing_type VARCHAR(255),
    additional_information TEXT,

    -- Metadata
    division ENUM('Criminal', 'Civil') NOT NULL,
    source_url VARCHAR(500) NOT NULL,
    scraped_at TIMESTAMP NOT NULL,
    scrape_version INT DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes
    UNIQUE KEY unique_hearing (list_date, case_number, time),
    INDEX idx_hearing_datetime (hearing_datetime),
    INDEX idx_case_number (case_number),
    INDEX idx_list_date (list_date),
    INDEX idx_division (division),
    FULLTEXT INDEX ft_search (case_details, hearing_type, additional_information, judge, venue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 8.2 Index Strategy

1. **Unique Constraint:** Prevents duplicate hearings (including deleted_at to allow reappearing records)
2. **DateTime Index:** Fast sorting and filtering by hearing date/time
3. **Case Number Index:** Quick lookup by case
4. **List Date Index:** Efficient queries for specific days
5. **Full-Text Index:** Enable natural language search across text fields

---

## 9. Implementation Considerations

### 9.1 Required Libraries (NodeJS)

- **HTML Parser:** `cheerio` (recommended) or `jsdom`
- **Date/Time:** `date-fns` or `luxon`
- **Database:** `mysql2` (for MariaDB)
- **Validation:** `joi` or custom validators

### 9.2 Configuration

Externalize the following parameters:

```javascript
{
  "alertEmail": "admin@example.com",  // Email for structure change alerts
  "timezone": "Europe/London",        // UK local time
  "expectedColumns": [
    "venue", "judge", "time", "case number",
    "case details", "hearing type", "additional information"
  ],
  "emailService": {
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "alerts@example.com",
        "pass": "${SMTP_PASSWORD}"  // From environment variable
      }
    },
    "from": "CACD Archive <alerts@example.com>"
  }
}
```

### 9.3 Performance Considerations

- Parse operations should complete in < 1 second for typical table (10-50 rows)
- Database synchronization should use transactions
- Consider batching inserts/updates for large tables (>100 rows)
- Use prepared statements to prevent SQL injection

### 9.4 Logging

**Log the following for each parse operation:**

- Start time (UTC) and list date (UK local)
- Number of rows processed
- Number of validation warnings
- Number of records returned
- Synchronization results (added, updated, deleted counts)
- Parse duration
- Email alerts sent (if any)
- Any errors or exceptions

---

## 10. Testing Strategy

### 10.1 Unit Tests

1. **Table Extraction:**
   - Find table in valid HTML
   - Handle missing table
   - Handle multiple tables

2. **Cell Inheritance:**
   - First row with all cells populated
   - Second row with empty inheritable cells
   - Third row continuing inheritance
   - Empty non-inheritable cells

3. **Time Parsing:**
   - Valid formats: "10:30am", "2:00pm", "10:30 am"
   - Invalid formats: "25:00", "10:70am", "TBC"
   - Edge cases: "12:00am", "12:00pm"

4. **DateTime Construction:**
   - Morning times (am)
   - Afternoon times (pm)
   - Midnight and noon
   - Timezone handling

5. **Record Validation:**
   - Complete valid record
   - Missing time field
   - Missing case number
   - Malformed time

### 10.2 Integration Tests

1. **Real HTML Parsing:**
   - Parse actual daily cause list
   - Verify all records extracted
   - Check inheritance applied correctly

2. **Database Synchronization:**
   - Insert new records
   - Update existing records
   - Delete removed records
   - Handle re-appearing records

### 10.3 Edge Case Tests

1. Empty table (no hearings)
2. Single row table
3. Table with all cells identical (heavy inheritance)
4. Very long text fields
5. Special characters and HTML entities

---

## 11. Design Decisions

### 11.1 Delete Strategy

**Decision:** Hard Delete

When records are removed from the daily cause list during re-scraping (e.g., hearing time changes from 2pm to 3pm), stale records are permanently deleted from the database. The database reflects only the current published state.

### 11.2 Change History

**Decision:** No Change History

The system maintains only the current state of each hearing. Historical changes are not tracked in the database. If audit trail is required, this can be maintained through application logs.

### 11.3 Duplicate Detection

**Decision:** Treat as Separate Hearings

The same case number appearing at different times on the same day represents distinct hearings (the hearing type should differ). These are stored as separate records with unique composite keys (date + case number + time).

### 11.4 Data Retention

**Decision:** Indefinite Retention

All scraped data is retained indefinitely. The system does not automatically purge old records. Housekeeping/archival processes may be introduced in the future if needed.

### 11.5 Header Mapping Strategy

**Decision:** Map by Header Text Content

Column headers are mapped by their text content (case-insensitive, whitespace-normalized) rather than by position. This provides flexibility if column order changes.

**Alert Mechanism:**
If the system cannot successfully map all expected columns:

1. Log critical error with missing column names
2. Send email notification to configured administrator
3. Abort parsing to prevent data corruption

**Implementation:**

```javascript
FUNCTION validateHeaders(headers)
    requiredHeaders = [
        "venue", "judge", "time", "case number",
        "case details", "hearing type", "additional information"
    ]

    normalizedHeaders = headers.map(h => h.toLowerCase().trim())

    FOR EACH required IN requiredHeaders
        IF required NOT IN normalizedHeaders THEN
            error = "Missing required column: " + required
            LOG_CRITICAL(error)
            sendAlertEmail(error, headers)
            THROW ParseError(error)
        END IF
    END FOR
END FUNCTION

FUNCTION sendAlertEmail(errorMessage, foundHeaders)
    // Send email to configured admin address
    email = {
        to: config.alertEmail,
        subject: "CACD Archive: Table Structure Changed",
        body: "Unable to parse daily cause list.\n\n" +
              "Error: " + errorMessage + "\n\n" +
              "Found headers: " + foundHeaders.join(", ") + "\n\n" +
              "Please update the parsing algorithm."
    }
    emailService.send(email)
END FUNCTION
```

### 11.6 Time Zone Handling

**Decision:** UK Local Time (Europe/London)

All times in the daily cause list are treated as UK local time (London timezone). The system:

- Stores times in local time format without explicit timezone
- Assumes Europe/London timezone for all datetime operations
- Handles British Summer Time (BST) / Greenwich Mean Time (GMT) transitions automatically
- Documents this assumption clearly for any consumers of the data

**Note:** If the application needs to display times in other timezones, conversion should be done at the presentation layer, not in storage.

---

## 12. Next Steps

1. Implement HTML fetching and table extraction
2. Implement cell parsing with inheritance logic
3. Implement date/time parsing and validation
4. Create database schema
5. Implement database synchronization logic
6. Create comprehensive test suite
7. Test with real data from multiple days
8. Document actual edge cases encountered

---

## Document History

| Version | Date             | Author  | Changes                         |
| ------- | ---------------- | ------- | ------------------------------- |
| 1.0     | 11 December 2025 | Initial | Initial algorithm specification |
