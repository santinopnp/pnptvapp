const winston = require('winston');

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp || new Date().toISOString()}] [${level.toUpperCase()}]: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

// Stream for morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = logger;
