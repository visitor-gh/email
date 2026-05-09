import { MongoClient, Db, Collection } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client: MongoClient;
let db: Db;

export async function initializeDb(): Promise<void> {
  client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
  await client.connect();
  db = client.db(process.env.DB_NAME || 'email_system');
}

export function getDb(): Db {
  return db;
}

export function getCollection<T extends object>(name: string): Collection<T> {
  return db.collection<T>(name);
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
  }
}

export function getClient(): MongoClient {
  return client;
}

export default getDb;
