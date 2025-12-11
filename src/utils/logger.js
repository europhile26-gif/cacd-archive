const pino = require('pino');
const config = require('../config/config');

const logger = pino({
  level: config.logging?.level || 'info',
  transport:
    config.env === 'development'
      ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
      : undefined
});

module.exports = logger;
