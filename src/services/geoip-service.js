/**
 * GeoIP Service
 * Country and ASN lookups against local MaxMind GeoLite2 .mmdb files.
 * Each database loads independently, so a missing or corrupt file degrades that
 * lookup to null rather than taking the other one (or the app) down with it.
 */

const maxmind = require('maxmind');
const config = require('../config/config');
const logger = require('../utils/logger');

let countryReader = null;
let asnReader = null;
let initialised = false;

/**
 * Opens one .mmdb file, returning null (and warning) if it cannot be read.
 */
async function openDatabase(databasePath, label) {
  let reader = null;

  try {
    reader = await maxmind.open(databasePath);
    logger.info(`GeoIP ${label} database loaded`, { path: databasePath });
  } catch (error) {
    logger.warn(`GeoIP ${label} database unavailable — lookups will return null`, {
      path: databasePath,
      error: error.message
    });
  }

  return reader;
}

/**
 * Loads both databases. Safe to call more than once.
 */
async function initialize() {
  if (initialised) {
    return;
  }

  countryReader = await openDatabase(config.geoip.countryDbPath, 'country');
  asnReader = await openDatabase(config.geoip.asnDbPath, 'ASN');
  initialised = true;
}

/**
 * Returns the ISO 3166-1 alpha-2 country code for an address, or null.
 */
function lookupCountry(ipAddress) {
  let countryCode = null;

  if (countryReader && ipAddress) {
    try {
      const result = countryReader.get(ipAddress);
      // Some allocations (e.g. anycast ranges) carry only registered_country.
      countryCode = result?.country?.iso_code || result?.registered_country?.iso_code || null;
    } catch (error) {
      // Malformed or private addresses throw rather than returning null.
      logger.debug('GeoIP country lookup failed', { ip: ipAddress, error: error.message });
    }
  }

  return countryCode;
}

/**
 * Returns { asn, organisation } for an address; both null when unavailable.
 */
function lookupAsn(ipAddress) {
  let asn = null;
  let organisation = null;

  if (asnReader && ipAddress) {
    try {
      const result = asnReader.get(ipAddress);
      asn = result?.autonomous_system_number ?? null;
      organisation = result?.autonomous_system_organization ?? null;
    } catch (error) {
      logger.debug('GeoIP ASN lookup failed', { ip: ipAddress, error: error.message });
    }
  }

  return { asn, organisation };
}

/**
 * True when the address resolves to a country on the blocklist.
 */
function isBlockedCountry(countryCode) {
  return Boolean(countryCode) && config.geoip.blockedCountries.includes(countryCode);
}

/**
 * True when a blocklist is configured at all — lets callers skip the hook entirely.
 */
function hasBlocklist() {
  return config.geoip.blockedCountries.length > 0;
}

/**
 * Releases the readers. Used by tests and shutdown.
 */
function close() {
  countryReader = null;
  asnReader = null;
  initialised = false;
}

module.exports = {
  initialize,
  lookupCountry,
  lookupAsn,
  isBlockedCountry,
  hasBlocklist,
  close
};
