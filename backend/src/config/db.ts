import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log(`[DB] Connected to MongoDB: ${env.mongodbUri}`);
  } catch (err) {
    console.error('[DB] Connection failed:', err);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected');
});
