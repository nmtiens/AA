import { Pool, types } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// OID 1082 = DATE type. Keep as string to avoid timezone shifts.
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error on idle client:', err);
});

// Graceful shutdown to drain the pool when the app stops
process.on('SIGINT', async () => {
  console.log('Closing PostgreSQL pool...');
  await pool.end();
  console.log('PostgreSQL pool closed.');
  process.exit(0);
});