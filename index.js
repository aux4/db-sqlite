import { createClient } from "@libsql/client";
import { Readable } from "stream";

function convertBigInts(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigInts(value);
    }
    return converted;
  }
  return obj;
}

class Database {
  constructor(config) {
    this.config = config;
  }

  async open() {
    const { database, ...options } = this.config;
    this.db = createClient({
      url: `file:${database}`,
      ...options
    });
  }

  async close() {
    if (!this.db) return;

    await this.db.close();
  }

  async execute(sql, params = {}) {
    try {
      const result = await this.db.execute({ sql, args: params });
      
      if (result.rows && result.rows.length > 0) {
        return { data: convertBigInts(result.rows) };
      } else {
        return { 
          data: { 
            changes: convertBigInts(result.rowsAffected || 0), 
            lastInsertRowid: convertBigInts(result.lastInsertRowid || null)
          } 
        };
      }
    } catch (error) {
      throw error;
    }
  }

  async stream(sql, params = {}) {
    const result = await this.db.execute({ sql, args: params });
    return Readable.from(convertBigInts(result.rows || []));
  }
}

export default Database;
