import { Pool } from 'pg';

declare global {
  // Allow global 'var' declarations for HMR in development
  // eslint-disable-next-line no-var
  var pool: Pool | undefined;
}

// Module-scoped pool for production
let pool: Pool | undefined;

function createPool() {
  const connectionString = process.env.POSTGRES_URL;

    // 调试：打印环境变量

  console.log("[DEBUG] Reading POSTGRES_URL:", connectionString);

  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set. Please check your .env.local file.");
  }

  console.log(`Creating new PostgreSQL connection pool for ${process.env.NODE_ENV} environment...`);
  return new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
}

export function getDbPool(): Pool {
  // In production, use the module-scoped pool variable.
  if (process.env.NODE_ENV === 'production') {
    if (!pool) {
      pool = createPool();
    } 
    return pool;
  } 
  // In development, use the global variable to preserve the pool across HMR reloads.
  else {
    if (!global.pool) {
      global.pool = createPool();
    }
    return global.pool;
  }
}

// For convenience, we can also export a direct query function
export const query = (text: string, params?: any[]) => {
    const p = getDbPool();
    return p.query(text, params);
}; 