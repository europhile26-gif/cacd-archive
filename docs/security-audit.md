# Security Audit Report

## Date: 2025-12-17

## Summary

Overall security posture is **GOOD** with some recommended improvements.

---

## ✅ Current Security Measures (Working Well)

### 1. SQL Injection Protection - **EXCELLENT**

- ✅ All database queries use parameterized queries (prepared statements)
- ✅ User input is never directly concatenated into SQL strings
- ✅ `sortBy` and `sortOrder` are validated via Fastify schema with enum constraints
- ✅ Example: `sql += ' AND list_date = ?'; params.push(date);`

**Verified in:**

- `src/api/routes/hearings.js` - All queries properly parameterized
- `src/services/sync-service.js` - All queries properly parameterized
- `src/services/scrape-history-service.js` - All queries properly parameterized

### 2. HTTP Security Headers - **EXCELLENT**

- ✅ Content Security Policy (CSP) configured
- ✅ HSTS with 1-year max-age
- ✅ X-Frame-Options
- ✅ X-Content-Type-Options
- ✅ Trust proxy enabled for correct IP detection

**Configured in:** `src/api/server.js`

### 3. Rate Limiting - **GOOD**

- ✅ API rate limiting enabled (100 requests per 15 minutes)
- ✅ Prevents brute force and DoS attacks

### 4. Input Validation - **GOOD**

- ✅ Fastify JSON schema validation on all API endpoints
- ✅ Type checking, format validation, enums, min/max constraints
- ✅ Invalid input is rejected before processing

### 5. CORS Configuration - **GOOD**

- ✅ Configurable CORS with environment-based restrictions
- ✅ Can be disabled for same-origin-only deployments

---

## ⚠️ Security Issues Found

### 1. XSS Vulnerability in Frontend - **MEDIUM RISK**

**Issue:** Using `innerHTML` with unsanitized API data in `public/js/app.js`

**Vulnerable Code:**

```javascript
row.innerHTML = `
  <td class="hearing-datetime">${formatDateTime(hearing.hearingDateTime)}</td>
  <td class="venue">${hearing.venue || '-'}</td>
  <td class="case-number">${hearing.caseNumber}</td>
  <td class="case-details">${hearing.caseDetails || '-'}</td>
  <td class="hearing-type">${hearing.hearingType || '-'}</td>
  <td class="judge">${hearing.judge || '-'}</td>
`;
```

**Risk:**
If malicious content (e.g., `<script>alert('XSS')</script>`) is scraped from the gov.uk site or injected into the database, it could be executed in users' browsers.

**Recommendation:**

1. Create a sanitization helper function
2. Escape HTML entities before inserting into DOM
3. Consider using `textContent` for text-only fields

---

## 🔒 Recommended Security Improvements

### Priority 1: Fix XSS Vulnerability

**Action:** Add HTML sanitization to frontend

**Implementation:**

```javascript
// Add helper function
function escapeHtml(text) {
  if (!text) return '-';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Use in rendering
row.innerHTML = `
  <td class="hearing-datetime">${formatDateTime(hearing.hearingDateTime)}</td>
  <td class="venue">${escapeHtml(hearing.venue)}</td>
  <td class="case-number">${escapeHtml(hearing.caseNumber)}</td>
  <td class="case-details">${escapeHtml(hearing.caseDetails)}</td>
  <td class="hearing-type">${escapeHtml(hearing.hearingType)}</td>
  <td class="judge">${escapeHtml(hearing.judge)}</td>
`;
```

### Priority 2: Database Input Validation

**Action:** Add input validation in sync-service before database insertion

**Rationale:** Defense in depth - validate scraped data before storing

**Implementation:**

```javascript
// Validate and sanitize scraped data
function sanitizeScrapedData(record) {
  return {
    ...record,
    caseNumber: String(record.caseNumber || '').substring(0, 50),
    venue: String(record.venue || '').substring(0, 255),
    caseDetails: String(record.caseDetails || '').substring(0, 65535),
    hearingType: String(record.hearingType || '').substring(0, 65535),
    judge: String(record.judge || '').substring(0, 65535)
  };
}
```

### Priority 3: Add Security Response Headers

**Action:** Consider adding additional security headers

**Headers to consider:**

- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` to restrict browser features

### Priority 4: Environment Variable Validation

**Action:** Add validation for critical environment variables on startup

**Implementation:**

```javascript
function validateEnv() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
```

### Priority 5: Audit Logging

**Action:** Add security event logging

**Events to log:**

- Failed authentication attempts (if auth is added)
- Rate limit violations
- Unusual query patterns
- Database errors that might indicate injection attempts

### Priority 6: Dependency Security

**Action:** Regular security updates

**Recommendations:**

```bash
# Run regularly
npm audit
npm audit fix

# Consider adding to CI/CD
npm audit --audit-level=moderate
```

---

## 📋 Security Checklist for Production

- [x] SQL injection protection (parameterized queries)
- [x] HTTP security headers (Helmet)
- [x] Rate limiting
- [x] Input validation (Fastify schemas)
- [x] CORS configuration
- [x] HTTPS enabled (ensure in production)
- [x] Trust proxy configured
- [ ] **XSS protection (needs fixing)**
- [ ] HTML sanitization in frontend
- [ ] Input length validation in scraper
- [ ] Environment variable validation
- [ ] Security audit logging
- [ ] Regular dependency updates
- [ ] Database backups configured
- [ ] Error messages don't leak sensitive info

---

## 🎯 Immediate Actions Required

1. **Fix XSS vulnerability** - Add HTML escaping to frontend rendering
2. **Add input validation** - Validate scraped data before database insertion
3. **Test with malicious input** - Verify XSS protection works
4. **Document security practices** - Add to README

---

## Additional Recommendations

### 1. Content Security Policy Enhancement

Current CSP allows `unsafe-inline` for scripts/styles. Consider:

- Moving inline scripts to separate files
- Using nonces or hashes for inline scripts
- Removing `unsafe-inline` for stronger protection

### 2. Database Security

- ✅ Using connection pooling
- ✅ Limited connection pool size
- Consider: Read-only database user for API queries
- Consider: Separate user for scraping/writing

### 3. Error Handling

Review error messages to ensure they don't leak:

- Database structure details
- File paths
- Stack traces in production

### 4. Monitoring

Consider adding:

- Failed request monitoring
- Unusual traffic pattern detection
- Database query performance monitoring

---

## Conclusion

The application has a **solid security foundation** with proper SQL injection protection, HTTP security headers, and input validation. The main concern is the XSS vulnerability in the frontend, which should be addressed before public deployment.

**Risk Level:** LOW-MEDIUM (after fixing XSS: LOW)
**Production Ready:** Yes, after implementing Priority 1 fix
