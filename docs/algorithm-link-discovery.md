# Algorithm: Link Discovery

**Document:** Link Discovery Algorithm  
**Related Requirement:** FR-001  
**Version:** 1.0  
**Date:** 11 December 2025

---

## 1. Overview

This document describes the algorithm for discovering the correct daily cause list link(s) from the Court of Appeal publications summary page.

**Source URL:** `https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109`

**Target:** Link(s) to "Court of Appeal (Criminal Division) Daily Cause List" for today and/or tomorrow

**Note:** The system may find lists for both today and tomorrow on the same page. Both should be processed.

---

## 2. Algorithm Steps

### 2.1 Fetch Summary Page

```
INPUT: Base URL with locationId=109
OUTPUT: HTML document

STEPS:
1. Send HTTP GET request to summary page URL
2. Set appropriate User-Agent header
3. Handle HTTP response codes:
   - 200: Success, proceed to parsing
   - 404: Page not found, log error and exit
   - 5xx: Server error, implement retry with exponential backoff
   - Other: Log unexpected status and exit
4. Validate response contains HTML content
5. Return HTML document for parsing
```

**Error Handling:**

- Network timeout: Retry up to 3 times with increasing delays (5s, 10s, 20s)
- Connection refused: Log error and exit (possible maintenance)
- DNS resolution failure: Log error and exit

---

## 3. Parse HTML Structure

### 3.1 Expected Structure

The summary page contains a list of publications for the Royal Courts of Justice. Each publication is represented as a link with specific text patterns.

**Expected Link Format:**

```
Court of Appeal (Criminal Division) Daily Cause List [DATE] - English (Saesneg)
```

Where `[DATE]` follows the format: `DD MMMM YYYY` (e.g., "11 December 2025")

### 3.2 HTML Parsing Strategy

```
INPUT: HTML document
OUTPUT: URL for today's CACD Daily Cause List

STEPS:
1. Load HTML into DOM parser (e.g., cheerio, jsdom)
2. Extract all anchor (<a>) elements
3. For each link:
   a. Extract link text content
   b. Extract href attribute
4. Filter links to find target publication
5. Return matching URL
```

---

## 4. Link Identification Logic

### 4.1 Matching Criteria

**Important:** Link text is manually entered and may be inconsistent. The algorithm must use flexible, case-insensitive matching.

The algorithm must identify links for **both today AND tomorrow** (if present) using the following criteria:

**Required Components (ALL must be present, case-insensitive):**

1. Phrase: "Court of Appeal"
2. Division keyword: "Criminal" (or "Civil" for future extension)
3. Day of month: e.g., "11" (as a number)
4. Month name: "December" or "Dec" (full or abbreviated)
5. Year: "2025" (4-digit year)

**Example Target Texts:**

```
Court of Appeal (Criminal Division) Daily Cause List 11 December 2025 - English (Saesneg)
Court of Appeal (civil division) daily cause list 12 Dec 2025 - English
COURT OF APPEAL Criminal Daily Cause List 11 december 2025
```

**Actual HTML Structure:**

```html
<a href="court-of-appeal-criminal-daily-cause-list?artefactId=..."
  >Court of Appeal (Criminal Division) Daily Cause List 11 December 2025 - English (Saesneg)</a
>
```

### 4.2 Pseudocode

```javascript
FUNCTION findCACDLinks(htmlDocument, division = "Criminal")
    // Parse HTML
    links = extractAllLinks(htmlDocument)

    // Get today and tomorrow dates
    today = getCurrentDate()
    tomorrow = addDays(today, 1)
    targetDates = [today, tomorrow]

    matchedLinks = []

    // Search for links matching today OR tomorrow
    FOR EACH targetDate IN targetDates
        result = findLinkForDate(links, targetDate, division)
        IF result IS NOT NULL THEN
            matchedLinks.append(result)
        END IF
    END FOR

    RETURN matchedLinks
END FUNCTION

FUNCTION findLinkForDate(links, targetDate, division)
    // Extract date components
    day = targetDate.day           // e.g., "11"
    monthFull = targetDate.monthName   // e.g., "December"
    monthShort = targetDate.monthAbbrev // e.g., "Dec"
    year = targetDate.year         // e.g., "2025"

    FOR EACH link IN links
        linkText = link.text.trim()
        linkTextLower = linkText.toLowerCase()

        // Check all required components (case-insensitive)
        IF containsCaseInsensitive(linkText, "Court of Appeal") AND
           containsCaseInsensitive(linkText, division) AND
           containsWord(linkText, day) AND
           (containsWord(linkText, monthFull) OR containsWord(linkText, monthShort)) AND
           containsWord(linkText, year) THEN

            // Construct full URL if relative
            fullUrl = resolveUrl(link.href)

            RETURN {
                url: fullUrl,
                linkText: linkText,
                date: targetDate,
                division: division
            }
        END IF
    END FOR

    // No match found for this date
    RETURN null
END FUNCTION

FUNCTION containsCaseInsensitive(text, phrase)
    RETURN text.toLowerCase().includes(phrase.toLowerCase())
END FUNCTION

FUNCTION containsWord(text, word)
    // Match word with word boundaries to avoid partial matches
    // e.g., "11" should match "11 December" but not "110" or "211"
    pattern = "\\b" + word + "\\b"
    RETURN regex_match(text, pattern, CASE_INSENSITIVE)
END FUNCTION

FUNCTION resolveUrl(href)
    IF href.startsWith("http://") OR href.startsWith("https://") THEN
        RETURN href
    ELSE
        baseUrl = "https://www.court-tribunal-hearings.service.gov.uk/"
        RETURN baseUrl + href
    END IF
END FUNCTION
```

---

## 5. Edge Cases and Fallback Strategies

### 5.1 Edge Cases

**Case 1: No Publication for Today**

- **Scenario:** Court is not in session (weekend, holiday)
- **Handling:** Return null/empty result with appropriate log message
- **Expected Behavior:** System should gracefully skip scraping for this day

**Case 2: Multiple Matches for Same Date**

- **Scenario:** Multiple links match criteria for the same date (e.g., duplicate entries, updated version)
- **Handling:** Take the first match for each unique date and log warning if duplicates found
- **Expected Behavior:** System should find 0-2 links total (today and/or tomorrow)

**Case 3: Date Format Variation**

- **Scenario:** Date format differs from expected (e.g., "11th December 2025", "Dec 11, 2025")
- **Handling:** Component-based matching handles most variations:
  - Ordinal suffixes (11th, 12th) are ignored by word boundary matching
  - Month abbreviations (Dec) are supported alongside full names (December)
  - Component order doesn't matter as long as all are present

**Case 4: Link Text Variations**

- **Scenario:** Minor text variations (whitespace, punctuation)
- **Handling:**
  - Normalize whitespace (collapse multiple spaces)
  - Case-insensitive matching for key phrases
  - Flexible matching for "English" indicator

**Case 5: Bilingual Content**

- **Scenario:** Both English and Welsh versions present
- **Handling:** Explicitly select English version
- **Filter:** Must contain "English" or "Saesneg" in text, prefer "English"

### 5.2 Fallback Strategy

If primary matching fails for a date, no fallback is performed for that date. The algorithm moves to the next date.

```
FOR each date (today, tomorrow):
    TRY: Match all required components
        ↓ (if match found)
    ADD to results
        ↓ (if no match)
    CONTINUE to next date

RETURN: All matched links (may be empty array)
```

**Rationale:** Component-based matching is already flexible. Further fallbacks risk matching incorrect lists.

---

## 6. Validation

### 6.1 Post-Discovery Validation

After identifying a link, validate before proceeding:

```
VALIDATION CHECKS:
1. URL is well-formed (valid HTTP/HTTPS URL)
2. URL hostname matches expected domain
3. URL is not empty or null
4. URL points to expected document type (PDF or HTML)

IF validation fails:
    Log error with details
    Return null
END IF
```

### 6.2 Expected URL Patterns

Based on the source website, the discovered URL is expected to match one of these patterns:

```
https://www.court-tribunal-hearings.service.gov.uk/[path]/[document-id]
https://publicaccess.courts.gov.uk/[path]/[document-id]
```

---

## 7. Output Specification

### 7.1 Success Output

```json
{
  "success": true,
  "discoveryTimestamp": "2025-12-11T10:30:00Z",
  "division": "Criminal",
  "linksFound": [
    {
      "url": "https://www.court-tribunal-hearings.service.gov.uk/court-of-appeal-criminal-daily-cause-list?artefactId=debd7ee7-b06b-48c8-91b8-b82053dc53a7",
      "linkText": "Court of Appeal (Criminal Division) Daily Cause List 11 December 2025 - English (Saesneg)",
      "targetDate": "2025-12-11"
    },
    {
      "url": "https://www.court-tribunal-hearings.service.gov.uk/court-of-appeal-criminal-daily-cause-list?artefactId=...",
      "linkText": "Court of Appeal (Criminal Division) Daily Cause List 12 December 2025 - English (Saesneg)",
      "targetDate": "2025-12-12"
    }
  ]
}
```

### 7.2 No Links Found Output

```json
{
  "success": true,
  "discoveryTimestamp": "2025-12-11T10:30:00Z",
  "division": "Criminal",
  "linksFound": [],
  "message": "No Court of Appeal (Criminal Division) lists found for 2025-12-11 or 2025-12-12",
  "linksSearched": 15
}
```

**Note:** Finding no links is not necessarily an error (e.g., weekends, holidays).

---

## 8. Implementation Considerations

### 8.1 Required Libraries (NodeJS)

- **HTTP Client:** `axios` or `node-fetch`
- **HTML Parser:** `cheerio` (jQuery-like syntax) or `jsdom`
- **Date Handling:** `date-fns` or `luxon` for date formatting
- **Logging:** `winston` or `pino`

### 8.2 Configuration

Externalize the following parameters:

```javascript
{
  "summaryPageUrl": "https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109",
  "targetCourt": "Court of Appeal",
  "targetDivisions": ["Criminal"],  // Can add "Civil" later
  "searchDaysAhead": 1,  // Search today + 1 day ahead (tomorrow)
  "requestTimeout": 10000,
  "retryAttempts": 3,
  "retryDelays": [5000, 10000, 20000],
  "userAgent": "CACD-Archive-Bot/1.0 (Educational Project)",
  "baseUrl": "https://www.court-tribunal-hearings.service.gov.uk/"
}
```

### 8.3 Logging Requirements

Log the following information:

**INFO Level:**

- Fetch initiated with timestamp
- Links discovered successfully (count and dates)
- No links found for today/tomorrow (expected scenario)
- Processing link for specific date

**WARN Level:**

- Multiple matching links found
- Fallback strategy activated
- Unexpected link text format

**ERROR Level:**

- HTTP errors (4xx, 5xx)
- Network failures after all retries
- Parsing errors
- Validation failures

---

## 9. Testing Strategy

### 9.1 Unit Tests

1. **HTML Parsing:**
   - Test with sample HTML containing target link
   - Test with HTML missing target link
   - Test with multiple matching links
   - Test with malformed HTML

2. **Date Formatting:**
   - Test current date formatting
   - Test date format variations
   - Test with different locales

3. **Link Matching:**
   - Test exact match
   - Test case-insensitive matching
   - Test with extra whitespace
   - Test with Welsh version present

### 9.2 Integration Tests

1. **Live Website:**
   - Test against actual summary page
   - Verify discovered URL is accessible
   - Test on days when no list is published

2. **Error Scenarios:**
   - Test with network disconnected
   - Test with invalid URL
   - Test with server returning errors

---

## 10. Open Questions

1. **Time Zone:** What timezone should be used for "today" and "tomorrow"? (Recommendation: Europe/London - GMT/BST)
2. **Publication Time:** What time of day are lists typically published?
3. **Welsh Version:** Should we ever fallback to Welsh version if English is unavailable?
4. **Archive Access:** Can we access historical lists by modifying the URL pattern?
5. **robots.txt:** What does the website's robots.txt specify about scraping frequency?

---

## 11. Next Steps

1. Implement HTTP fetching module with retry logic
2. Implement HTML parsing and link extraction
3. Implement date handling and formatting
4. Create unit tests for link matching logic
5. Test against live website
6. Document actual HTML structure observed
7. Proceed to table parsing algorithm (next document)

---

## Document History

| Version | Date             | Author  | Changes                         |
| ------- | ---------------- | ------- | ------------------------------- |
| 1.0     | 11 December 2025 | Initial | Initial algorithm specification |
