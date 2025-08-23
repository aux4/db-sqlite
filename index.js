import { createClient } from "@libsql/client";
import { Readable } from "stream";

function convertBigInts(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, convertBigInts(v)])
    );
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

    // Clean up prepared statements
    for (const stmt of this.preparedStatements.values()) {
      try {
        await stmt.finalize();
      } catch (error) {
        // Ignore finalization errors
      }
    }
    this.preparedStatements.clear();

    await this.db.close();
  }

  async execute(sql, params = {}) {
    try {
      let stmt = this.preparedStatements.get(sql);
      if (!stmt) {
        stmt = await this.db.prepare(sql);
        this.preparedStatements.set(sql, stmt);
      }
      
      const result = await stmt.execute(params);
      
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
      
      let stmt = this.preparedStatements.get(sql);
      if (!stmt) {
        stmt = await this.db.prepare(sql);
        this.preparedStatements.set(sql, stmt);
      }
      
      // Use transaction for batch operations
      await this.db.execute('BEGIN TRANSACTION');
      
      try {
        for (const params of paramsList) {
          const result = await stmt.execute(params);
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
    let stmt = this.preparedStatements.get(sql);
    if (!stmt) {
      stmt = await this.db.prepare(sql);
      this.preparedStatements.set(sql, stmt);
    }
    
    const result = await stmt.execute(params);
    return Readable.from(convertBigInts(result.rows || []));
  }
}

export default Database;
