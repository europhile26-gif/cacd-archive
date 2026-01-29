/**
 * Startup Security Checks
 * Performs security validations before the application starts
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Check if the .env file has secure permissions (0600)
 * @param {string} envPath - Path to the .env file
 * @returns {boolean} - True if permissions are secure or check is skipped
 */
function checkEnvFilePermissions(envPath) {
  const skipCheck = process.env.SKIP_STARTUP_FILESYSTEM_CHECK === 'true';

  if (skipCheck) {
    logger.warn('SKIP_STARTUP_FILESYSTEM_CHECK is enabled - skipping .env permission check');
    logger.warn('This should only be used in development or on systems without Unix permissions');
    return true;
  }

  // Skip check on Windows (process.platform === 'win32')
  if (process.platform === 'win32') {
    logger.info('Running on Windows - skipping .env permission check');
    return true;
  }

  try {
    if (!fs.existsSync(envPath)) {
      logger.error(`SECURITY ERROR: .env file not found at ${envPath}`);
      return false;
    }

    const stats = fs.statSync(envPath);
    const mode = stats.mode;

    // Extract permission bits (last 9 bits)
    const permissions = mode & parseInt('777', 8);

    // Convert to octal string for logging
    const permissionsOctal = permissions.toString(8);

    // Check if permissions are 0600 (owner read/write only)
    if (permissions !== parseInt('600', 8)) {
      logger.error('╔════════════════════════════════════════════════════════════════╗');
      logger.error('║                   SECURITY ERROR                               ║');
      logger.error('╠════════════════════════════════════════════════════════════════╣');
      logger.error(
        `║ .env file has insecure permissions: ${permissionsOctal.padEnd(4)}                        ║`
      );
      logger.error('║ Required permissions: 0600 (read/write for owner only)        ║');
      logger.error('║                                                                ║');
      logger.error('║ To fix this issue, run:                                       ║');
      logger.error(`║   chmod 0600 ${envPath.padEnd(45)} ║`);
      logger.error('║                                                                ║');
      logger.error('║ To skip this check (NOT recommended for production):          ║');
      logger.error('║   Set SKIP_STARTUP_FILESYSTEM_CHECK=true in your environment  ║');
      logger.error('╚════════════════════════════════════════════════════════════════╝');
      return false;
    }

    logger.info(`✓ .env file permissions verified (${permissionsOctal})`);
    return true;
  } catch (error) {
    logger.error('Error checking .env file permissions:', error);
    return false;
  }
}

/**
 * Run all startup security checks
 * @throws {Error} if any security check fails
 */
function runStartupSecurityChecks() {
  const envPath = path.join(__dirname, '../../.env');

  logger.info('Running startup security checks...');

  if (!checkEnvFilePermissions(envPath)) {
    throw new Error('Startup security check failed: .env file has insecure permissions');
  }

  logger.info('✓ All startup security checks passed');
}

module.exports = {
  runStartupSecurityChecks,
  checkEnvFilePermissions
};
