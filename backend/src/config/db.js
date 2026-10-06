import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';

dotenv.config();

// Ensure Node resolves MongoDB Atlas SRV records correctly across Windows environments
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore in environments where setting DNS servers is restricted
}

/**
 * Connect to MongoDB database instance
 */
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/askcampusai';
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB Connection Warning] ${error.message}`);
    console.warn('[MongoDB Notice] Ensure MongoDB is running or specify a remote MONGODB_URI in backend/.env.');
    return null;
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('[MongoDB] Connection state: Disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Connection state: Reconnected');
});

export default connectDB;
