/**
 * Notification Service
 * Handles saved search matching and email notifications
 */

const { format } = require('date-fns');
const SavedSearch = require('../models/SavedSearch');
const db = require('../config/database');
const emailService = require('./email-service');
const logger = require('../utils/logger');
const config = require('../config/config');

class NotificationService {
  /**
   * Process saved search notifications after scraping new data
   * Should be called after new hearings are added to database
   */
  async processSavedSearchNotifications() {
    try {
      logger.info('Starting saved search notification processing');

      // Get all active saved searches for users with notifications enabled
      const activeSearches = await SavedSearch.getActiveSearchesForNotifications();

      if (activeSearches.length === 0) {
        logger.info('No active saved searches found');
        return { sent: 0, skipped: 0, failed: 0 };
      }

      logger.info(`Found ${activeSearches.length} active saved searches`);

      // Group searches by user
      const searchesByUser = this.groupSearchesByUser(activeSearches);

      const stats = {
        sent: 0,
        skipped: 0,
        failed: 0
      };

      // Process each user
      for (const [userId, userSearches] of Object.entries(searchesByUser)) {
        try {
          await this.processUserNotifications(parseInt(userId, 10), userSearches, stats);
        } catch (error) {
          logger.error('Failed to process user notifications', {
            userId,
            error: error.message
          });
          stats.failed++;
        }
      }

      logger.info('Saved search notification processing complete', stats);
      return stats;
    } catch (error) {
      logger.error('Failed to process saved search notifications', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Group saved searches by user
   */
  groupSearchesByUser(searches) {
    const grouped = {};

    searches.forEach((search) => {
      if (!grouped[search.user_id]) {
        grouped[search.user_id] = {
          email: search.email,
          name: search.name,
          searches: []
        };
      }

      grouped[search.user_id].searches.push({
        id: search.search_id,
        text: search.search_text
      });
    });

    return grouped;
  }

  /**
   * Process notifications for a single user
   */
  async processUserNotifications(userId, userData, stats) {
    // Check if user can receive notification (rate limiting)
    const canReceive = await SavedSearch.canReceiveNotification(userId);

    if (!canReceive) {
      logger.debug('User rate limited for notifications', { userId });
      stats.skipped++;
      return;
    }

    // Run all saved searches for this user
    const searchResults = await this.runUserSearches(userData.searches);

    // Filter out searches with no matches
    const searchesWithMatches = searchResults.filter((result) => result.matches.length > 0);

    if (searchesWithMatches.length === 0) {
      logger.debug('No matches found for user', { userId });
      stats.skipped++;
      return;
    }

    // Calculate total matches
    const totalMatches = searchesWithMatches.reduce(
      (sum, result) => sum + result.matches.length,
      0
    );

    // Send email notification
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${config.port}`;

      await emailService.sendSavedSearchMatches({
        userEmail: userData.email,
        userName: userData.name,
        searches: searchesWithMatches,
        baseUrl,
      });

      // Record notification sent
      await SavedSearch.recordNotification(userId, totalMatches, searchesWithMatches.length);

      logger.info('Sent saved search notification', {
        userId,
        email: userData.email,
        matchCount: totalMatches,
        searchCount: searchesWithMatches.length
      });

      stats.sent++;
    } catch (error) {
      logger.error('Failed to send notification email', {
        userId,
        email: userData.email,
        error: error.message
      });
      stats.failed++;
    }
  }

  /**
   * Run all searches for a user and return matches
   */
  async runUserSearches(searches) {
    const results = [];

    for (const search of searches) {
      const matches = await this.runSearch(search.text);

      results.push({
        searchText: search.text,
        matches
      });
    }

    return results;
  }

  /**
   * Run a single saved search query
   * Searches cases with hearing dates TODAY or TOMORROW
   */
  async runSearch(searchText) {
    try {
      // Get today and tomorrow's dates
      const today = format(new Date(), 'yyyy-MM-dd');
      const tomorrow = format(new Date(Date.now() + 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

      // Build query using same logic as hearings API endpoint
      const sql = `
        SELECT * 
        FROM hearings
        WHERE 
          list_date >= ? AND list_date <= ?
          AND (
            MATCH(case_details, hearing_type, additional_information, judge, venue) 
            AGAINST(? IN NATURAL LANGUAGE MODE) 
            OR case_number LIKE ?
          )
        ORDER BY list_date ASC, hearing_datetime ASC
        LIMIT 100
      `;

      const params = [today, tomorrow, searchText, `%${searchText}%`];
      const hearings = await db.query(sql, params);

      // Format matches for email - map actual column names from hearings table
      const formattedMatches = hearings.map((hearing) => ({
        case_name:
          hearing.case_details ||
          (hearing.case_number ? `Case ${hearing.case_number}` : 'Unknown Case'),
        list_date_formatted: format(new Date(hearing.list_date), 'EEEE, d MMMM yyyy'),
        hearing_time: hearing.time || 'Not specified',
        court_room: hearing.venue || 'Not specified',
        hearing_type: hearing.hearing_type,
        judge_names: hearing.judge,
      }));

      return formattedMatches;
    } catch (error) {
      logger.error('Failed to run saved search', {
        searchText,
        error: error.message
      });
      return [];
    }
  }
}

// Export singleton instance
const notificationService = new NotificationService();
module.exports = notificationService;
