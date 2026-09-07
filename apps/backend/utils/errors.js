class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

function isOperationalError(error) {
  if (!error) return false;
  if (typeof error.isOperational === 'boolean') {
    return error.isOperational;
  }
  const statusCode = error.statusCode || error.status;
  return statusCode >= 400 && statusCode < 500;
}

module.exports = {
  AppError,
  isOperationalError
};
