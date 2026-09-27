/**
 * Structured logging module using pino
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started');
 *   logger.error({ err, userId }, 'Failed to process request');
 *   logger.debug({ data }, 'Debug information');
 */

const path = require('path');
const fs = require('fs');
const pino = require('pino');

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';

// Log level from environment, defaulting based on environment
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

const LOG_FILE_CAP_BYTES = 10 * 1024 * 1024; // 10 MB
const LOG_ROTATE_CHECK_MS = 10 * 60 * 1000;
// A request slower than this is logged even when it succeeded.
const SLOW_REQUEST_MS = 1000;

// Move the log file aside as <file>.1 (replacing any older one) if it has grown past
// the cap. Returns true when it did. Never throws — logging must not take the app down.
function rotateIfOversized(file) {
  try {
    if (fs.statSync(file).size < LOG_FILE_CAP_BYTES) return false;
    fs.renameSync(file, `${file}.1`);
    return true;
  } catch (e) {
    return false;
  }
}

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

// Create the logger instance.
// - Development runs with a real console, so pretty-print to stdout.
// - Production (including the packaged desktop app, which is launched from the
//   GUI with no attached console) must NOT write to stdout: that throws EBADF
//   and crashes the process. Write JSON logs to a file under the data
//   directory instead, and never let a logging error take the app down.
let logger;
if (isDevelopment) {
  logger = pino(options, pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname,app',
      singleLine: false
    }
  }));
} else {
  const logDir = path.join(process.env.DATA_DIR || process.cwd(), 'logs');
  const logFile = path.join(logDir, 'server.log');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    /* ignore — fall through to the destination, which also creates dirs */
  }
  // The server PC runs for months without a restart, so the file is capped: once it
  // passes LOG_FILE_CAP_BYTES it becomes server.log.1 (replacing the previous one)
  // and a fresh server.log starts — at most two capped files on disk, ever.
  rotateIfOversized(logFile);
  // sync: true opens the file immediately, so logs written during startup (and
  // flushed if the app exits early on an error) are captured rather than
  // throwing "sonic boom is not ready yet".
  const destination = pino.destination({
    dest: logFile,
    mkdir: true,
    sync: true
  });
  // A write failure on the log file must never crash the server.
  destination.on('error', () => {});
  logger = pino(options, destination);
  // Checked now and then rather than per line, so a busy day overshoots the cap by
  // at most a few minutes' worth. Unref'd so it never holds the process open.
  setInterval(() => {
    if (rotateIfOversized(logFile)) {
      try { destination.reopen(); } catch (e) { /* keep logging to the old handle */ }
    }
  }, LOG_ROTATE_CHECK_MS).unref();
}

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

    // Log at different levels based on status code. A plain success is debug only:
    // the screens re-check the sign-in and the timer every few seconds, so logging
    // each one at info filled the production log file with tens of thousands of
    // lines a day. Failures and slow requests still show at the default level.
    if (res.statusCode >= 500) {
      logger.error(logData, 'Request failed');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request error');
    } else if (duration > SLOW_REQUEST_MS) {
      logger.info(logData, 'Slow request');
    } else {
      logger.debug(logData, 'Request completed');
    }
  });

  next();
}

module.exports = logger;
module.exports.requestLogger = requestLogger;
