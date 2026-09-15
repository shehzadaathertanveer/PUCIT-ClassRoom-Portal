const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use Google DNS and IPv4 first to bypass local ISP SRV/DNS blocking
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

let cachedConnection = null;

// Drop legacy UNIQUE indexes on users collection that no longer apply.
// Freshers share a section prefix (e.g. BITF26A) as rollNo and may reuse
// temporary emails, so unique constraints must be removed at the DB level.
const dropUniqueIndexes = async (conn) => {
  try {
    const usersColl = conn.connection.db.collection('users');
    const indexes = await usersColl.indexes();
    const candidateNames = ['rollNo_1', 'registrationNo_1', 'email_1', 'personalNotificationEmail_1'];
    for (const idx of indexes) {
      if (candidateNames.includes(idx.name) && idx.unique) {
        await usersColl.dropIndex(idx.name);
        console.log(`Dropped legacy unique index: ${idx.name}`);
      }
    }
  } catch (error) {
    console.warn(`Index cleanup skipped (non-fatal): ${error.message}`);
  }
};

const connectDB = async () => {
  // If already connected, reuse the existing connection (Crucial for Vercel serverless)
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const DB_URI = process.env.MONGO_URI;

  if (!DB_URI) {
    throw new Error('DATABASE_URI is missing from environment variables!');
  }

  try {
    const conn = await mongoose.connect(DB_URI);
    cachedConnection = conn;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await dropUniqueIndexes(conn);
    return cachedConnection;
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    // CRITICAL: Never use process.exit(1) in serverless, as it kills the container!
    throw error;
  }
};

module.exports = connectDB;