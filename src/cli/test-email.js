#!/usr/bin/env node

/**
 * Test Email CLI
 * Sends a test data error email to verify email service configuration
 */

const emailService = require('../services/email-service');
const logger = require('../utils/logger');

async function testEmail() {
  try {
    logger.info('Testing email service...');

    // Initialize email service
    await emailService.initialize();
    logger.info('Email service initialized successfully');

    // Send test data error email
    logger.info('Sending test data error email...');
    await emailService.sendDataError({
      type: 'link-discovery',
      error: 'This is a test error to verify email notifications are working correctly.',
      stack:
        'Error: Test error\n    at testEmail (/path/to/test-email.js:25:10)\n    at async start (/path/to/test-email.js:50:5)',
      date: new Date().toISOString().split('T')[0],
      url: 'https://www.court-tribunal-hearings.service.gov.uk/summary-of-publications?locationId=109',
      context: {
        testMode: true,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      },
      htmlSample:
        '<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body>\n<h1>Sample HTML</h1>\n<p>This is a sample HTML snippet to test email formatting.</p>\n</body>\n</html>'
    });

    logger.info('Test email sent successfully!');
    logger.info('Check your inbox at:', process.env.EMAIL_RECIPIENT_DATA_ERRORS);

    // Close email service
    await emailService.close();
    process.exit(0);
  } catch (error) {
    logger.error('Test email failed:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

testEmail();
