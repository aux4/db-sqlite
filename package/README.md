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

## Output Formats

### Execute Command Output

The `execute` command returns results as JSON arrays:

**Success:**
```json
[
  {"id": 1, "name": "Alice", "age": 30, "email": "alice@example.com"},
  {"id": 2, "name": "Bob", "age": 25, "email": "bob@example.com"}
]
```

**Errors (to stderr):**
```json
[{"item": {"name": "Bad Data"}, "query": "INSERT INTO users...", "error": "NOT NULL constraint failed: users.age"}]
```

### Stream Command Output

The `stream` command returns newline-delimited JSON objects (NDJSON):

```json
{"id": 1, "name": "Alice", "age": 30, "email": "alice@example.com"}
{"id": 2, "name": "Bob", "age": 25, "email": "bob@example.com"}
```

**Errors (to stderr):**
```json
{"item": {}, "query": "SELECT invalid_column FROM users", "error": "no such column: invalid_column"}
```

## Advanced Features

### Batch Processing with inputStream

Process multiple records from JSON input:

```bash
# Create JSON file with batch data
cat > users.json << EOF
[
  {"name": "User1", "age": 25, "email": "user1@example.com"},
  {"name": "User2", "age": 30, "email": "user2@example.com"}
]
EOF

# Execute batch insert
cat users.json | aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --inputStream
```

### Parameter Override

CLI parameters override JSON input parameters:

```bash
# Override email for all records in the batch
cat users.json | aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --email "override@example.com" \
  --inputStream
```

### Transaction Management

**With transactions (`--tx`):**
- All operations execute within a single transaction
- On error, all changes are rolled back
- Ensures data consistency for batch operations

```bash
# Transactional batch - all or nothing
cat batch.json | aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --inputStream --tx
```

**Without transactions:**
- Each operation commits individually
- Successful operations persist even if later ones fail
- Faster for large batches but less consistent

### Error Handling

**Default behavior (`--ignore` not set):**
- Stop on first error
- Exit with non-zero code
- Error details sent to stderr

**With `--ignore` flag:**
- Continue processing remaining records
- Output successful results to stdout
- Send errors to stderr but exit with zero code

```bash
# Process all records, ignoring failures
cat mixed_data.json | aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --inputStream --ignore
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

### Query with Parameters

```bash
aux4 db sqlite execute \
  --database my.db \
  --query "SELECT * FROM users WHERE age >= :minAge AND email LIKE :domain" \
  --minAge 25 --domain "%@example.com"
```

### Transaction Rollback Demonstration

```bash
# Good and bad records in a single batch; --tx rolls back all if any fail
echo '[{"name":"Good","age":20,"email":"good@example.com"},{"name":"Bad"}]' | \
  aux4 db sqlite execute --database my.db \
    --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
    --inputStream --tx
```

### Stream Processing Pipeline

```bash
# Create audit table
aux4 db sqlite execute --database my.db \
  --query "CREATE TABLE user_audit (audit_id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, audit_timestamp TEXT DEFAULT CURRENT_TIMESTAMP)"

# Stream users and insert audit records
aux4 db sqlite stream --database my.db --query "SELECT id, name FROM users WHERE age >= 25" | \
  aux4 db sqlite stream --database my.db \
    --query "INSERT INTO user_audit (user_id, user_name) VALUES (:id, :name) returning audit_id" \
    --inputStream
```

### Error Recovery with --ignore

```bash
# Process mixed data, continuing despite errors
cat > mixed_data.json << EOF
[
  {"name": "Valid User", "age": 30, "email": "valid@example.com"},
  {"invalid_field": "bad data"},
  {"name": "Another Valid User", "age": 25, "email": "another@example.com"}
]
EOF

cat mixed_data.json | aux4 db sqlite execute \
  --database my.db \
  --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" \
  --inputStream --ignore
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
