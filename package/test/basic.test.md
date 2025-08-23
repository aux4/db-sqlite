# Basic Database Operations

```beforeAll
aux4 db sqlite execute --database test.db --query "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT)"
```

```afterAll
aux4 db sqlite execute --database test.db --query "DROP TABLE users"
```

## Insert single record

```execute
aux4 db sqlite execute --database test.db --query "INSERT INTO users (name, age, email) VALUES ('John', 28, 'john@example.com') returning *" | jq .
```

```expect
[
  {
    "id": 1,
    "name": "John",
    "age": 28,
    "email": "john@example.com"
  }
]
```

## Insert using parameters

```execute
aux4 db sqlite execute --database test.db --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" --name Peter --age 55 --email peter@nothere.com | jq .
```

```expect
[
  {
    "id": 2,
    "name": "Peter",
    "age": 55,
    "email": "peter@nothere.com"
  }
]
```

## Insert using JSON file

```file:users.json
[
  {
    "name": "Alice",
    "age": 30,
    "email": "alice@person.com"
  },
  {
    "name": "Bob",
    "age": 25,
    "email": "bob@person.com"
  }
]
```

### Only the values from the file

```execute
cat users.json | aux4 db sqlite execute --database test.db --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" --inputStream | jq .
```

```expect
[
  {
    "id": 3,
    "name": "Alice",
    "age": 30,
    "email": "alice@person.com"
  },
  {
    "id": 4,
    "name": "Bob",
    "age": 25,
    "email": "bob@person.com"
  }
]
```

### Overriding one of the parameters

```execute
cat users.json | aux4 db sqlite execute --database test.db --query "INSERT INTO users (name, age, email) VALUES (:name, :age, :email) returning *" --email noemail@example.com --inputStream | jq .
```

```expect
[
  {
    "id": 5,
    "name": "Alice",
    "age": 30,
    "email": "noemail@example.com"
  },
  {
    "id": 6,
    "name": "Bob",
    "age": 25,
    "email": "noemail@example.com"
  }
]
```

## Stream mode

### Query all users as stream

```execute
aux4 db sqlite stream --database test.db --query "SELECT * FROM users ORDER BY id"
```

```expect
{"id":1,"name":"John","age":28,"email":"john@example.com"}
{"id":2,"name":"Peter","age":55,"email":"peter@nothere.com"}
{"id":3,"name":"Alice","age":30,"email":"alice@person.com"}
{"id":4,"name":"Bob","age":25,"email":"bob@person.com"}
{"id":5,"name":"Alice","age":30,"email":"noemail@example.com"}
{"id":6,"name":"Bob","age":25,"email":"noemail@example.com"}
```

### Stream with parameters

```execute
aux4 db sqlite stream --database test.db --query "SELECT name, email FROM users WHERE age >= :minAge ORDER BY name" --minAge 30
```

```expect
{"name":"Alice","email":"alice@person.com"}
{"name":"Alice","email":"noemail@example.com"}
{"name":"Peter","email":"peter@nothere.com"}
```

## Stream piping

```beforeAll
aux4 db sqlite execute --database test.db --query "CREATE TABLE IF NOT EXISTS user_audit (audit_id INTEGER PRIMARY KEY, user_id INTEGER, user_name TEXT, user_email TEXT, audit_timestamp TEXT DEFAULT CURRENT_TIMESTAMP)"
```

```afterAll
aux4 db sqlite execute --database test.db --query "DROP TABLE user_audit"
```

### Stream users and insert into audit table

```execute
aux4 db sqlite stream --database test.db --query "SELECT id, name, email FROM users WHERE age >= 25" | aux4 db sqlite stream --database test.db --query "INSERT INTO user_audit (user_id, user_name, user_email) VALUES (:id, :name, :email) returning audit_id, user_name" --inputStream
```

```expect
{"audit_id":1,"user_name":"John"}
{"audit_id":2,"user_name":"Peter"}
{"audit_id":3,"user_name":"Alice"}
{"audit_id":4,"user_name":"Bob"}
{"audit_id":5,"user_name":"Alice"}
{"audit_id":6,"user_name":"Bob"}
```

### Verify audit records count

```execute
aux4 db sqlite execute --database test.db --query "SELECT COUNT(*) as audit_count FROM user_audit" | jq .
```

```expect
[
  {
    "audit_count": 6
  }
]
```
