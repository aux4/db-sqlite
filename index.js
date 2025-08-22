import SQLite from "better-sqlite3";
import { Readable } from "stream";

class Database {
  constructor(config) {
    this.config = config;
  }

  async open() {
    const { database, ...options } = this.config;
    this.db = new SQLite(database, options);
  }

  async close() {
    if (!this.db) return;

    this.db.close();
  }

  async execute(sql, params = {}) {
    const query = this.db.prepare(sql);
    
    try {
      const result = query.all(params);
      return { data: result };
    } catch (error) {
      if (error.message.includes('This statement does not return data')) {
        const result = query.run(params);
        return { data: { changes: result.changes, lastInsertRowid: result.lastInsertRowid } };
      }
      throw error;
    }
  }

  async stream(sql, params = {}) {
    const query = this.db.prepare(sql);
    const rows = query.iterate(params);
    return Readable.from(rows);
  }
}

export default Database;
