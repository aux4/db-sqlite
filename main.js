import Database from "libsql";

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: aux4-db-sqlite <database_path>");
  process.exit(1);
}

const databasePath = args[0];

let inputData = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", chunk => {
  inputData += chunk;
});

process.stdin.on("end", async () => {
  try {
    const trimmedInput = inputData.trim();
    if (!trimmedInput) {
      process.exit(4);
    }

    try {
      const request = JSON.parse(trimmedInput);
      await processRequest(request);
      return;
    } catch (singleJsonError) {
      const lines = trimmedInput.split("\n").filter(line => line.trim());
      if (lines.length > 1) {
        try {
          // Parse as NDJSON - each line should be a JSON object
          const items = lines.map(line => JSON.parse(line.trim()));

          // For stream input, we need to create a proper batch request
          // The aux4 command should pass the SQL and action via command line args
          // For now, process each item as individual requests
          for (const item of items) {
            if (item.action && item.sql) {
              try {
                await processRequest(item);
              } catch (error) {
                const errorOutput = {
                  item: item,
                  query: item.sql || 'unknown',
                  error: error.message
                };
                console.error(JSON.stringify(errorOutput));
              }
            }
          }
        } catch (ndjsonError) {
          throw singleJsonError;
        }
      } else {
        throw singleJsonError;
      }
    }
  } catch (error) {
    const errorOutput = {
      item: inputData ? inputData.trim() : null,
      query: 'unknown',
      error: `Error parsing JSON input: ${error.message}`
    };
    console.error(JSON.stringify(errorOutput));
    process.exit(1);
  }
});

async function processRequest(request) {
  let db;

  try {
    db = new Database(databasePath);
  } catch (error) {
    const errorOutput = {
      item: request || null,
      query: request?.sql || 'unknown',
      error: error.message
    };
    console.error(JSON.stringify(errorOutput));
    process.exit(1);
  }

  try {
    switch (request.action) {
      case "execute":
        await executeQuery(db, request);
        break;
      case "executeBatch":
        await executeBatch(db, request);
        break;
      case "stream":
        await streamQuery(db, request);
        break;
      case "streamBatch":
        await streamBatch(db, request);
        break;
      default:
        const errorOutput = {
          item: request || null,
          query: request?.sql || 'unknown',
          error: `Unknown action: ${request.action}`
        };
        console.error(JSON.stringify(errorOutput));
        process.exit(1);
    }
  } finally {
    if (db) {
      db.close();
    }
  }
}

function convertParameterSyntax(sql) {
  return sql.replace(/:(\w+)/g, "$$$1");
}


async function executeQuery(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const params = request.params || {};
  
  // Filter out non-SQL parameters for the item field in error output
  const { database, action, sql, inputStream, tx, ignore, ...sqlParams } = params;

  try {
    const stmt = db.prepare(convertedSql);
    const rows = stmt.all(params);
    console.log(JSON.stringify(rows));
  } catch (error) {
    const errorOutput = {
      item: sqlParams,
      query: request.sql,
      error: error.message
    };
    console.error(JSON.stringify([errorOutput]));
    if (!request.ignore) {
      process.exit(1);
    }
  }
}

async function executeBatch(db, request) {
  if (request.tx) {
    await executeBatchWithTransaction(db, request);
  } else {
    await executeBatchWithoutTransaction(db, request);
  }
}

async function executeBatchWithTransaction(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const errors = [];
  
  try {
    const stmt = db.prepare(convertedSql);
    const transaction = db.transaction(items => {
      const results = [];
      let hasAnyResults = false;

      for (const item of items) {
        try {
          const rows = stmt.all(item);
          results.push(...rows);
          if (rows.length > 0) {
            hasAnyResults = true;
          }
        } catch (error) {
          // Filter out aux4 parameters from the item for clean error reporting
          const { database, action, sql, inputStream, tx, ignore, aux4HomeDir, configDir, packageDir, query, file, ...cleanItem } = item;
          errors.push({
            item: cleanItem,
            query: request.sql,
            error: error.message
          });
          throw error;
        }
      }

      return { results, hasAnyResults };
    });

    const { results, hasAnyResults } = transaction(request.items);

    if (!hasAnyResults) {
      console.log(JSON.stringify({ success: true, count: request.items.length }));
    } else {
      console.log(JSON.stringify(results));
    }
  } catch (error) {
    if (errors.length > 0) {
      console.error(JSON.stringify(errors));
    } else {
      console.error(JSON.stringify([{
        item: null,
        query: request.sql,
        error: error.message
      }]));
    }
    if (!request.ignore) {
      process.exit(1);
    }
  }
}

async function executeBatchWithoutTransaction(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const results = [];
  const errors = [];
  let hasAnyResults = false;
  let stmt;
  
  try {
    stmt = db.prepare(convertedSql);
  } catch (error) {
    console.error(JSON.stringify([{
      item: null,
      query: request.sql,
      error: error.message
    }]));
    if (!request.ignore) {
      process.exit(1);
    }
  }

  for (const item of request.items) {
    try {
      const rows = stmt.all(item);
      results.push(...rows);
      if (rows.length > 0) {
        hasAnyResults = true;
      }
    } catch (error) {
      // Filter out aux4 parameters from the item for clean error reporting
      const { database, action, sql, inputStream, tx, ignore, aux4HomeDir, configDir, packageDir, query, file, ...cleanItem } = item;
      errors.push({
        item: cleanItem,
        query: request.sql,
        error: error.message
      });
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify(errors));
    if (!request.ignore) {
      process.exit(1);
    }
  }

  // Always output results, even if there were errors (when ignore is true)
  if (!hasAnyResults && errors.length === 0) {
    console.log(JSON.stringify({ success: true, count: request.items.length }));
  } else if (hasAnyResults) {
    console.log(JSON.stringify(results));
  }
}

async function streamQuery(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const params = request.params || {};
  
  // Filter out non-SQL parameters for the item field in error output
  const { database, action, sql, inputStream, tx, ignore, ...sqlParams } = params;

  try {
    const stmt = db.prepare(convertedSql);
    const rows = stmt.all(params);

    rows.forEach(row => {
      console.log(JSON.stringify(row));
    });
  } catch (error) {
    const errorOutput = {
      item: sqlParams,
      query: request.sql,
      error: error.message
    };
    console.error(JSON.stringify(errorOutput));
    if (!request.ignore) {
      process.exit(1);
    }
  }
}

async function streamBatch(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  
  try {
    const stmt = db.prepare(convertedSql);
    
    if (request.tx) {
      const transaction = db.transaction(items => {
        for (const item of items) {
          try {
            const rows = stmt.all(item);
            rows.forEach(row => {
              console.log(JSON.stringify(row));
            });
          } catch (error) {
            // Filter out aux4 parameters from the item for clean error reporting
            const { database, action, sql, inputStream, tx, ignore, aux4HomeDir, configDir, packageDir, query, file, ...cleanItem } = item;
            const errorOutput = {
              item: cleanItem,
              query: request.sql,
              error: error.message
            };
            console.error(JSON.stringify(errorOutput));
            if (!request.ignore) {
              throw error;
            }
          }
        }
      });
      transaction(request.items);
    } else {
      for (const item of request.items) {
        try {
          const rows = stmt.all(item);
          rows.forEach(row => {
            console.log(JSON.stringify(row));
          });
        } catch (error) {
          // Filter out aux4 parameters from the item for clean error reporting
          const { database, action, sql, inputStream, tx, ignore, aux4HomeDir, configDir, packageDir, query, file, ...cleanItem } = item;
          const errorOutput = {
            item: cleanItem,
            query: request.sql,
            error: error.message
          };
          console.error(JSON.stringify(errorOutput));
        }
      }
    }
  } catch (error) {
    const errorOutput = {
      item: null,
      query: request.sql,
      error: error.message
    };
    console.error(JSON.stringify(errorOutput));
    if (!request.ignore) {
      process.exit(1);
    }
  }
}
