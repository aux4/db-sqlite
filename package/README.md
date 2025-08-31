# aux4/db-sqlite

SQLite database tools for the aux4 CLI.

The `aux4/db-sqlite` package provides seamless integration with SQLite databases directly from your command line. You can execute SQL queries, perform batch inserts, stream results for large datasets, manage transactions, and handle errors gracefully. Ideal for quick prototypes, ETL pipelines, automation scripts, and interactive database tasks without writing custom scripts.

## Installation

```bash
aux4 aux4 pkger install aux4/db-sqlite
```

## Quick Start

Create a database, define a table, insert a record, and query data:

```bash
# Create a new database and users table
aux4 db sqlite execute \
  --database my.db \
  --query "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT)"

# Insert a user and return the inserted row as JSON
aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES ('Alice', 30, 'alice@example.com') returning *"
```

## Usage

### Main Commands

- [`aux4 db sqlite execute`](./commands/db/sqlite/execute) - Execute SQL statements on a SQLite database and return all results as a JSON array.
- [`aux4 db sqlite stream`](./commands/db/sqlite/stream) - Execute SQL statements and stream each row as a newline-delimited JSON object.

### Command Reference

#### aux4 db sqlite execute

Run one or more SQL statements on a SQLite database and collect all results in memory.

Usage:
```bash
aux4 db sqlite execute \
  [--database <path>] \
  [--query "<SQL>"] \
  [--file <script.sql>] \
  [--inputStream] \
  [--tx] \
  [--ignore]
```

Options:

- `--database <path>`     Path to the SQLite file (default: `:memory:`)
- `--query "<SQL>"`      SQL statement to execute (positional if `arg: true`)
- `--file <sql_file.sql>` Execute SQL from a file
- `--inputStream`         Read a JSON array from stdin as input parameters
- `--tx`                  Wrap all operations in a single transaction
- `--ignore`              Ignore errors and continue processing, reporting failures

Examples:

```bash
# Named-parameter insert
aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --name Bob --age 25 --email bob@example.com

# Batch insert from JSON via stdin
echo '[{"name":"Carol","age":22,"email":"carol@example.com"}]' | \
  aux4 db sqlite execute --database my.db \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
    --inputStream

# Transactional insert (rollback on error)
echo '[{"name":"Tx1","age":40,"email":"tx1@example.com"},{"name":""}]' | \
  aux4 db sqlite execute --database my.db \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
    --inputStream --tx
```

#### aux4 db sqlite stream

Stream query results row-by-row for large datasets or piping into other commands.

Usage:
```bash
aux4 db sqlite stream \
  [--database <path>] \
  [--query "<SQL>"] \
  [--file <script.sql>] \
  [--inputStream] \
  [--tx] \
  [--ignore]
```

Options are the same as `execute`, but results are emitted as newline-delimited JSON objects.

Examples:

```bash
# Stream all users
aux4 db sqlite stream --database my.db --query "SELECT * FROM users ORDER BY id"

# Stream with a filter parameter
aux4 db sqlite stream \
  --database my.db \
  --query "SELECT name, email FROM users WHERE age >= :minAge ORDER BY name" \
  --minAge 30

# ETL pipeline: stream and immediately insert into audit table
aux4 db sqlite stream --database my.db --query "SELECT id, name FROM users" | \
  aux4 db sqlite stream \
    --database my.db \
    --query "INSERT INTO user_audit (user_id, audit_name) VALUES (:id, :name) returning audit_id" \
    --inputStream
```

## Examples

### Basic Query

```bash
aux4 db sqlite execute --database my.db --query "SELECT * FROM users"
```

### Insert with Named Parameters

```bash
aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --name "Dave" --age 45 --email dave@example.com
```

### Transaction Rollback Demonstration

```bash
# Good and bad records in a single batch; --tx rolls back all if any fail
echo '[{"name":"Good","age":20,"email":"good@example.com"},{"name":null}]' | \
  aux4 db sqlite execute --database my.db \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
    --inputStream --tx
```

## Real-World Scenario

Automate an audit pipeline that copies user changes into an audit table:

```bash
# Ensure audit table exists
aux4 db sqlite execute --database my.db --query "CREATE TABLE IF NOT EXISTS user_audit (audit_id INTEGER PRIMARY KEY, user_id INTEGER, audit_name TEXT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP)"

# Stream users and insert audit entries
aux4 db sqlite stream --database my.db --query "SELECT id, name FROM users WHERE age >= 18" | \
  aux4 db sqlite stream --database my.db --query "INSERT INTO user_audit (user_id, audit_name) VALUES (:id, :name) returning audit_id" --inputStream
```

## License

This package does not specify a license in its manifest. Please refer to the repository or the aux4 hub listing for licensing details.
