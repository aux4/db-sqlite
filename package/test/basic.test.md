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
