const AppError = require('../utils/appError');

// Handle specific Database/Auth errors cleanly
const handleCastErrorDB = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);
const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg ? err.errmsg.match(/(["'])(\\?.)*?\1/)[0] : '';
  return new AppError(`Duplicate field value: ${value}. Please use another value!`, 400);
};
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  return new AppError(`Invalid input data. ${errors.join('. ')}`, 400);
};
const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);
const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

// Centralized Error Middleware Function
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  let error = { ...err, message: err.message };

  // MongoDB / Mongoose Specific Errors
  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  res.status(error.statusCode).json({
    status: error.status,
    message: error.message || 'Something went wrong on the server!',
  });
};