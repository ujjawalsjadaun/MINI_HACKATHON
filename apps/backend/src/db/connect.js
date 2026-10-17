import mongoose from 'mongoose';
import { mongoUri } from '../config/env.js';

mongoose.set('strictQuery', true);

// Connects once and waits until the database answers. Every model uses this one shared connection.
export async function connectDb(uri = mongoUri()) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  // Models declare their indexes (unique emails, one report per student per issue); build them before serving.
  await mongoose.syncIndexes();
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

// Used by the health check and the tests: true only if the database really answers.
export async function pingDb() {
  await mongoose.connection.db.admin().ping();
  return true;
}

// Wipes the database this connection points at. Tests use it to start clean.
export async function dropDb() {
  await mongoose.connection.dropDatabase();
}
