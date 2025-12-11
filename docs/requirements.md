# CACD Archive - Requirements Specification

**Project Name:** CACD Archive  
**Version:** 1.0  
**Date:** 11 December 2025  
**Status:** Draft

---

## 1. Executive Summary

CACD Archive is a NodeJS-based web scraping and data archival system designed to capture, parse, and store daily cause lists from the Court of Appeal, Criminal Division (CACD) of the United Kingdom. The system will enable historical searching, filtering, and export of court hearing data that is currently only available on a daily basis.

---

## 2. Project Overview

### 2.1 Purpose

The UK Courts & Tribunals Judiciary publishes daily cause lists that are updated each day. These lists provide information about scheduled court hearings but are not maintained as a searchable historical archive. This project aims to:

- Automatically scrape daily cause lists from the official court website
- Parse and structure the tabular data contained within these lists
- Store the data in a persistent database for long-term access
- Enable future search, filter, and export capabilities

### 2.2 Scope

**In Scope (Phase 1):**
- Court of Appeal (Criminal Division) Daily Cause List

**Potential Future Scope:**
- Court of Appeal (Civil Division) Daily Cause List
- Other court division daily cause lists

**Out of Scope:**
- Real-time notifications
- Legal analysis or interpretation of case data
- User authentication and multi-user access (initially)

---

## 3. Functional Requirements

### 3.1 Data Source

**Primary Source URL:**  
`https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109`

**Target Document:**  
Court of Appeal (Criminal Division) Daily Cause List - Published daily in English

### 3.2 Core Functionality

#### FR-001: Link Discovery
- **Description:** The system must navigate to the summary of publications page and identify the correct daily cause list link
- **Acceptance Criteria:**
  - System can identify the "Court of Appeal (Criminal Division) Daily Cause List" link for the current date
  - System can distinguish between Criminal and Civil division lists
  - System handles date variations in link text

#### FR-002: HTML Retrieval
- **Description:** The system must follow the identified link and retrieve the full HTML content of the daily cause list
- **Acceptance Criteria:**
  - System successfully retrieves complete HTML document
  - System handles HTTP errors gracefully
  - System respects rate limiting and robots.txt

#### FR-003: Table Parsing
- **Description:** The system must parse the primary table containing hearing information from the HTML document
- **Acceptance Criteria:**
  - System identifies the correct table(s) within the document
  - System extracts all rows and columns
  - System preserves data relationships and structure
  - System handles variations in table format

#### FR-004: Data Storage
- **Description:** The system must store parsed data in a relational database
- **Acceptance Criteria:**
  - Data is stored in normalized database schema
  - Duplicate entries are prevented or handled appropriately
  - Data includes metadata (scrape date, source URL, etc.)
  - Database integrity is maintained

#### FR-005: Scheduling/Automation
- **Description:** The system should be capable of running automatically on a scheduled basis
- **Acceptance Criteria:**
  - System can be triggered via cron or similar scheduler
  - System logs execution results
  - System handles failures without data corruption

#### FR-006: Periodic Re-scraping
- **Description:** The system must re-scrape the daily cause list at regular intervals throughout the day to capture updates
- **Acceptance Criteria:**
  - System re-scrapes the same daily cause list every X hours (default: 2 hours)
  - System is configurable to adjust re-scraping interval
  - System tracks the timestamp of each scrape operation
  - System continues re-scraping until end of business day or list becomes unavailable

#### FR-007: Data Synchronization
- **Description:** The system must synchronize the database with the current state of the daily cause list, handling both additions and deletions
- **Acceptance Criteria:**
  - System identifies and adds new records that appear in updated versions of the list
  - System identifies and removes (or marks as deleted) records that have been removed from the list
  - System maintains historical record of changes (optional: change history/audit trail)
  - System handles partial updates without corrupting existing data
  - System can distinguish between records from the same day scraped at different times

---

## 4. Non-Functional Requirements

### 4.1 Technology Stack

- **Runtime:** NodeJS
- **Database:** MariaDB (primary candidate)
- **Language:** JavaScript/TypeScript (to be determined)

### 4.2 Performance

- **NFR-001:** System must complete a full scrape and parse cycle within 5 minutes under normal conditions
- **NFR-002:** Database queries should return results within 2 seconds for typical searches

### 4.3 Reliability

- **NFR-003:** System must handle network failures gracefully with appropriate retry logic
- **NFR-004:** System must not corrupt existing data if a scrape fails partially

### 4.4 Maintainability

- **NFR-005:** Code must be well-documented with clear module separation
- **NFR-006:** Configuration (URLs, database credentials, etc.) must be externalized
- **NFR-007:** System should log all significant operations for troubleshooting

### 4.5 Scalability

- **NFR-008:** Database schema should accommodate future expansion to other court divisions
- **NFR-009:** System architecture should allow for addition of new data sources

---

## 5. Data Requirements

### 5.1 Data Elements

The specific fields to be captured will be determined during detailed design, but are expected to include:

- Case reference/number
- Case name/parties
- Hearing date and time
- Court room/location
- Case type/category
- Judge(s)
- Legal representatives
- Hearing purpose/status

### 5.2 Data Retention

- Historical data should be retained indefinitely
- Archival/backup strategy to be defined

### 5.3 Data Quality

- Source URL must be stored with each dataset
- Scrape timestamp must be recorded for each data retrieval
- System must track when records are added, modified, or deleted
- Data validation rules to be defined during detailed design
- Mechanism to identify unique records across multiple scrapes must be defined

---

## 6. Constraints and Assumptions

### 6.1 Constraints

- Must comply with UK court website terms of service
- Must not overload source website with excessive requests
- Must respect any robots.txt directives

### 6.2 Assumptions

- Daily cause lists maintain a consistent format over time
- Website structure remains relatively stable
- Lists are published at predictable times each day
- Lists may be updated multiple times throughout the day
- Data is intended for public access

---

## 7. Success Criteria

The project will be considered successful when:

1. System can automatically identify and scrape the correct daily cause list
2. All tabular data is accurately parsed and stored
3. Historical data can be queried from the database
4. System runs reliably on a daily schedule
5. No manual intervention is required for normal operation

---

## 8. Next Steps

### 8.1 Detailed Design Phase

- Analyze sample daily cause list HTML structure
- Define complete database schema
- Design scraping algorithm and workflow
- Define error handling and retry logic
- Specify logging and monitoring requirements

### 8.2 Implementation Planning

- Select specific NodeJS libraries and frameworks
- Define project structure and module organization
- Establish development and testing environment
- Create implementation roadmap

---

## 9. Open Questions

1. What is the exact HTML structure of the target tables?
2. How frequently do table formats change?
3. What constitutes a unique record identifier for deduplication across scrapes?
4. Should deleted records be hard-deleted or soft-deleted (marked as removed)?
5. Should the system maintain a full audit history of all changes to records?
6. Are there any API alternatives to HTML scraping?
7. What search/filter/export capabilities are required for end users?
8. Who will be the users of the archived data?
9. What is the deployment environment (server specs, location)?
10. At what time should the system stop re-scraping each day (e.g., end of court hours)?

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 11 December 2025 | Initial | Initial requirements document |

