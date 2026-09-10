# Legitimate Interests Assessment — Request Analytics

**Assessment date:** 10 September 2026
**Version assessed:** v1.20.0 (`request_log`, `analytics-service`, `geoip-service`)
**Reviewed by:** site operator (data controller)
**Review due:** on any change to what is collected, or annually

This assessment supports relying on **Article 6(1)(f) UK GDPR (legitimate interests)** as the
lawful basis for the server-side request analytics described in `docs/configuration.md` and
published to visitors at `/privacy`.

It is written to be re-read when the design changes. If a future change adds a field, lengthens
retention, or starts recording query strings, this assessment no longer covers it.

---

## Why an assessment is needed at all

Two separate regimes apply, and it is easy to conflate them:

- **PECR / ePrivacy** governs storing or reading information **on the user's device**. This
  system stores nothing there — no cookies, no `localStorage`, no client-side script. PECR's
  consent requirement is therefore not engaged, and **no consent banner is required**.
- **UK GDPR** governs **processing personal data**, wherever it happens. An IP address is
  personal data (_Breyer_, C-582/14; ICO guidance follows it), and the pseudo-session fingerprint
  is **pseudonymised, not anonymised** — Recital 26 is explicit that pseudonymised data remains in
  scope. UK GDPR therefore applies in full, despite the absence of cookies.

The absence of a cookie banner is a consequence of the design, not evidence that GDPR does not
apply. Consent is not the appropriate basis here: analytics of this kind is not something a
visitor meaningfully opts into for the site to function, and asking would produce a worse outcome
(a banner) for no gain in protection.

## Part 1 — Purpose test

**What are we trying to achieve?**

1. Understanding how the archive is actually used — which pages and endpoints matter, how many
   distinct people use it, and how that changes over time.
2. Keeping the service available and performant — spotting error spikes and slow endpoints.
3. Protecting the service from abuse — vulnerability probing, aggressive scraping, and
   credential-stuffing attempts against the login endpoint.

**Who benefits?** The operator, and visitors, who get a service that stays up, stays fast, and is
not degraded by automated abuse.

**How important are these interests?** Moderate and legitimate, not vital. This is ordinary
operational necessity for running a public website, not a compelling interest that would justify
intrusive processing. That framing matters: it sets a low ceiling on what intrusion is
proportionate, and the design below reflects that.

## Part 2 — Necessity test

**Does the processing actually achieve the purpose?** Yes. Request counts by route answer
question 1; status codes and durations answer question 2; addresses, ASNs and probe paths answer
question 3.

**Is there a less intrusive way to get the same result?** This is where most of the design
decisions were made, and each represents a rejected, more intrusive alternative:

| Decision                                 | Less intrusive than                           | Why it still meets the purpose                                                                                           |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **No query strings recorded**            | Logging full URLs, as most web servers do     | Route-level counts answer "which features are used". **This is the most important decision in the design** — see below.  |
| **Route pattern, not interpolated path** | Logging `/api/v1/hearings/42`                 | Grouping by pattern is what makes the usage data readable; the specific record viewed is not needed                      |
| **Country and ASN only, no city**        | City-level geolocation, which GeoLite2 offers | ASN distinguishes datacentre from residential traffic, which is the actual signal; city adds identification, not insight |
| **Daily-rotating salted fingerprint**    | A persistent visitor ID, or a cookie          | Counts visitors within a day, which is the metric wanted; deliberately cannot track anyone across days                   |
| **Local GeoIP database**                 | A third-party IP-lookup API                   | Same result without disclosing any visitor's address to a third party                                                    |
| **30-day retention**                     | Indefinite retention, the web-server default  | Enough for month-over-month comparison and abuse investigation; short enough to bound exposure                           |
| **No third-party analytics**             | Google Analytics or similar                   | Removes the transfer entirely, along with the cookie banner it would require                                             |
| **Static assets excluded**               | Logging every request                         | Assets carry no usage signal and would be the majority of rows                                                           |
| **`DNT: 1` honoured**                    | Ignoring it, as is common                     | Costs nothing and gives visitors a working opt-out                                                                       |

**On query strings specifically.** This is a **court records archive**. The search endpoint accepts
a person's name and a case number. Recording those against an IP address would create a durable
record that a specific person, at a specific address, looked up a specific individual in criminal
court records. That is materially more sensitive than ordinary pageview analytics: it could reveal
the interests of journalists, defendants, victims or their families, and would be attractive to
anyone seeking to identify who is researching a case. It is not necessary for any of the three
purposes above. It is therefore **never recorded**, and two automated tests assert this so the
guarantee cannot regress unnoticed.

**Conclusion:** the processing is necessary for the stated purposes, and is the least intrusive
form that achieves them.

## Part 3 — Balancing test

**What is the relationship with the individual?** Mostly none — visitors are anonymous members
of the public. A minority hold accounts.

**Would people expect this?** Yes. Server-side request logging is near-universal and is what a
reasonable person expects any website to do. Several aspects are _less_ than expected: no cookie,
no third-party tracker, no search terms, 30-day deletion.

**How intrusive is it?** Low. No special category data (Article 9) is processed. Whether someone
searched is recorded; **what they searched for is not**. No profiling and no automated
decision-making with legal effect takes place. The country blocklist is the only automated
decision — it refuses a connection based on country. It does not process an application, deny a
service someone is entitled to, or produce a legal effect, so Article 22 is not engaged. Nobody is
individually assessed.

**Could it cause harm?** The realistic harms are (a) disclosure of the request log revealing who
visited, and (b) the log being used to identify a searcher. (b) is addressed structurally: without
query strings, the log shows that an address used the search endpoint, not what it looked for.
(a) is addressed by access control — the log is readable only with the `system:analytics`
capability, held by administrators — and by the 30-day retention that bounds any single
disclosure.

**Sensitivity of the surrounding context.** The site publishes criminal court listings. The
sensitivity lies in the _combination_ of a visitor and a case, and the design breaks that link by
construction rather than by policy.

**Safeguards in place:**

- Query strings never recorded — enforced in code, covered by tests
- Fingerprint salted with a server-side secret and the date; startup **fails** if the secret is
  missing, so a weak configuration cannot be deployed by accident
- Retention enforced by a nightly automated purge, not by manual discipline
- Access gated on a dedicated capability, separate from general admin rights
- GeoIP resolved locally; no visitor address leaves the server
- `DNT: 1` honoured
- Collection off by default; must be deliberately enabled
- Published privacy notice at `/privacy`, linked from the footer of every page

**Balance:** the interests pursued are ordinary and moderate; the intrusion is low and has been
actively minimised at each design decision; visitors retain a working objection route and an
automatic deletion guarantee. **Legitimate interests is an appropriate basis, and the processing
is proportionate.**

## Outcome

Proceed on Article 6(1)(f). Conditions:

1. The privacy notice at `/privacy` must be live before collection is enabled in production.
2. Objections under Article 21 are honoured; see the notice for what a requester must supply.
3. Any of the following invalidates this assessment and requires it to be redone **before**
   deployment: recording query strings; recording city or referrer; extending retention beyond
   30 days; removing the fingerprint salt or its daily rotation; sending data to a third party;
   or using the data to make decisions about individuals.

## Related documents

- `/privacy` — the published privacy notice (source: `public/privacy.html`)
- `docs/configuration.md` — what each setting does and what is collected
- `docs/security.md` — access control and reverse-proxy configuration
- `dev-notes/00-project-tracker.md` — M2.2, the design decisions and their rationale
