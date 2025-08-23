import { createClient } from "@libsql/client";
import { Readable } from "stream";

function convertBigInts(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) {
    const result = new Array(obj.length);
    for (let i = 0; i < obj.length; i++) {
      result[i] = convertBigInts(obj[i]);
    }
    return result;
  }
  if (typeof obj === 'object') {
    const converted = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        converted[key] = convertBigInts(obj[key]);
      }
    }
    return converted;
  }
  return obj;
}

class Database {
  constructor(config) {
    this.config = config;
    this.preparedStatements = new Map();
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

  async executeBatch(sql, paramsList) {
    try {
      const allResults = [];
      
      // Use transaction for batch operations
      await this.db.execute('BEGIN TRANSACTION');
      
      try {
        for (const params of paramsList) {
          const result = await this.db.execute({ sql, args: params });
          if (result.rows && result.rows.length > 0) {
            allResults.push(...convertBigInts(result.rows));
          } else {
            allResults.push({
              changes: convertBigInts(result.rowsAffected || 0),
              lastInsertRowid: convertBigInts(result.lastInsertRowid || null)
            });
          }
        }
        
        await this.db.execute('COMMIT');
        return { data: allResults };
      } catch (error) {
        await this.db.execute('ROLLBACK');
        throw error;
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
