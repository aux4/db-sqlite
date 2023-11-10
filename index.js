const SQLite = require("better-sqlite3");
const { Readable } = require("stream");

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
    const result = query.all(params);
    return { data: result };
  }

  async stream(sql, params = {}) {
    const query = this.db.prepare(sql);
    const rows = query.iterate(params);
    return Readable.from(rows);
  }
}

module.exports = Database;
