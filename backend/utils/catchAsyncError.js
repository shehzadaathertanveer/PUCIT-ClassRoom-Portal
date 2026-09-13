// utils/catchAsyncError.js
module.exports = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (typeof next === 'function') {
        next(err);
      } else {
        console.error('CRITICAL ERROR: next is not a function!', err);
        res.status(500).json({ status: 'error', message: err.message || 'Internal Server Error' });
      }
    });
  };
};