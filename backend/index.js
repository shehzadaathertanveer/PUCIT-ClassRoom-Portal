const dotenv = require('dotenv');

// 1. MUST BE AT THE VERY TOP: Catch synchronous runtime errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down process...');
  console.error(err.stack); // <-- Print the full stack trace here!
  process.exit(1);
});

const path = require('path');

// Load config/config.env as DEFAULT values in every environment (override:false
// means real process env vars always win). Previously the file was skipped when
// NODE_ENV=production — e.g. on Render — so stale dashboard EMAIL_* values were
// used silently and delivery broke. Now the current config.env always backs the
// SMTP credentials, quota settings, and connection strings.
dotenv.config({ path: path.join(__dirname, 'config/config.env'), override: false });

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

// Initialize Database connection
connectDB()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`PUCIT Portal Server running on port ${PORT}...`);
    });

    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION! Gracefully closing server...');
      console.error(err.name, err.message);
      server.close(() => {
        process.exit(1);
      });
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database connection on boot:', err);
    process.exit(1);
  });

module.exports = app;