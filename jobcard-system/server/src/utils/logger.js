/**
 * Structured logging module using pino
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started');
 *   logger.error({ err, userId }, 'Failed to process request');
 *   logger.debug({ data }, 'Debug information');
 */

const pino = require('pino');

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';

// Log level from environment, defaulting based on environment
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Configure pino options
const options = {
  level: logLevel,
  // Add timestamp to all log entries
  timestamp: pino.stdTimeFunctions.isoTime,
  // Base context included in all logs
  base: {
    app: 'jobcard-server'
  }
};

// In development, use pino-pretty for readable output
// In production, use JSON format for log aggregation
let transport;
if (isDevelopment) {
  transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname,app',
      singleLine: false
    }
  };
}

// Create the logger instance
const logger = pino(options, transport ? pino.transport(transport) : undefined);

/**
 * Express request logging middleware
 * Logs each incoming request with method, URL, and response time
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request start at debug level
  logger.debug({
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress
  }, 'Request received');

  // Capture response finish to log completion
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`
    };

    // Log at different levels based on status code
    if (res.statusCode >= 500) {
      logger.error(logData, 'Request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  next();
}

module.exports = logger;
module.exports.requestLogger = requestLogger;
