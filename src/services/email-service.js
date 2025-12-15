const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Email Service
 * Handles sending emails for data errors and user notifications
 */

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = {};
    this.initialized = false;
  }

  /**
   * Initialize email service
   */
  async initialize() {
    if (!config.email.enabled) {
      logger.info('Email notifications disabled');
      return;
    }

    try {
      // Create SMTP transporter
      this.transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: config.email.smtp.auth
      });

      // Verify connection
      await this.transporter.verify();
      logger.info('Email service initialized successfully', {
        host: config.email.smtp.host,
        port: config.email.smtp.port
      });

      // Load email templates
      await this.loadTemplates();

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize email service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Load and compile email templates
   */
  async loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates/emails');

    // Register handlebars helper for JSON formatting
    handlebars.registerHelper('json', function(context) {
      return JSON.stringify(context, null, 2);
    });

    try {
      // Load data error template
      const dataErrorHtml = await fs.readFile(path.join(templatesDir, 'data-error.html'), 'utf8');
      this.templates.dataError = handlebars.compile(dataErrorHtml);

      logger.debug('Email templates loaded successfully');
    } catch (error) {
      logger.error('Failed to load email templates', {
        error: error.message,
        templatesDir
      });
      throw error;
    }
  }

  /**
   * Send data error notification
   * @param {Object} errorDetails - Error details
   * @param {string} errorDetails.type - Error type ('link-discovery' or 'table-parsing')
   * @param {string} errorDetails.error - Error message
   * @param {string} errorDetails.stack - Stack trace
   * @param {string} errorDetails.date - Date being processed
   * @param {string} errorDetails.url - URL being scraped
   * @param {string} [errorDetails.htmlSample] - Sample of HTML causing issues
   * @param {Object} [errorDetails.context] - Additional context
   */
  async sendDataError(errorDetails) {
    if (!this.initialized || !config.email.enabled) {
      logger.debug('Email not sent - service not initialized or disabled');
      return;
    }

    if (!config.email.dataErrorRecipient) {
      logger.warn('Data error email not sent - no recipient configured');
      return;
    }

    try {
      const timestamp = new Date().toISOString();

      // Prepare template data
      const templateData = {
        type: errorDetails.type,
        typeLabel: this.getErrorTypeLabel(errorDetails.type),
        error: errorDetails.error,
        stack: errorDetails.stack,
        date: errorDetails.date,
        url: errorDetails.url,
        htmlSample: errorDetails.htmlSample,
        context: errorDetails.context,
        timestamp,
        environment: config.env
      };

      // Generate HTML email
      const html = this.templates.dataError(templateData);

      // Generate plain text version
      const text = this.generatePlainTextDataError(templateData);

      // Send email
      const info = await this.transporter.sendMail({
        from: config.email.from,
        to: config.email.dataErrorRecipient,
        subject: `[CACD Archive] ${templateData.typeLabel} Error - ${errorDetails.date || 'Unknown Date'}`,
        text,
        html
      });

      logger.info('Data error email sent successfully', {
        messageId: info.messageId,
        recipient: config.email.dataErrorRecipient,
        errorType: errorDetails.type
      });

      return info;
    } catch (error) {
      logger.error('Failed to send data error email', {
        error: error.message,
        stack: error.stack,
        errorType: errorDetails.type
      });
      throw error;
    }
  }

  /**
   * Get human-readable error type label
   */
  getErrorTypeLabel(type) {
    const labels = {
      'link-discovery': 'Link Discovery',
      'table-parsing': 'Table Parsing'
    };
    return labels[type] || type;
  }

  /**
   * Generate plain text version of data error email
   */
  generatePlainTextDataError(data) {
    let text = `CACD Archive - ${data.typeLabel} Error\n`;
    text += '==============================================\n\n';
    text += `Environment: ${data.environment}\n`;
    text += `Timestamp: ${data.timestamp}\n`;
    text += `Date: ${data.date || 'N/A'}\n`;
    text += `URL: ${data.url || 'N/A'}\n\n`;
    text += `Error Message:\n${data.error}\n\n`;

    if (data.stack) {
      text += `Stack Trace:\n${data.stack}\n\n`;
    }

    if (data.context) {
      text += `Additional Context:\n${JSON.stringify(data.context, null, 2)}\n\n`;
    }

    if (data.htmlSample) {
      text += `HTML Sample:\n${data.htmlSample}\n\n`;
    }

    text += '---\n';
    text += 'This is an automated alert from CACD Archive.\n';
    text += 'The .gov.uk site may have changed its HTML structure or naming conventions.\n';

    return text;
  }

  /**
   * Send user match notification (future use)
   * @param {string} userEmail - User's email address
   * @param {Array} matches - Matching hearings
   * @param {Object} _criteria - Search criteria that matched
   */
  async sendMatchNotification(userEmail, matches, _criteria) {
    // Placeholder for future implementation
    logger.debug('Match notification feature not yet implemented', {
      userEmail,
      matchCount: matches.length
    });
  }

  /**
   * Close email service
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      logger.debug('Email service closed');
    }
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = emailService;
