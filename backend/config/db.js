const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use Google DNS and IPv4 first to bypass local ISP SRV/DNS blocking
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

let cachedConnection = null;

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
    return cachedConnection;
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    // CRITICAL: Never use process.exit(1) in serverless, as it kills the container!
    throw error;
  }
};

module.exports = connectDB;