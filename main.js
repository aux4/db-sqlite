import Database from "libsql";

const AUX4_PARAMS = ['database', 'action', 'sql', 'inputStream', 'tx', 'ignore', 'aux4HomeDir', 'configDir', 'packageDir', 'query', 'file'];

function validateArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: aux4-db-sqlite <database_path>");
    process.exit(1);
  }
  return args[0];
}

function createErrorOutput(item, query, error) {
  return {
    item: item || null,
    query: query || 'unknown',
    error: error
  };
}

function filterAux4Params(params) {
  const filtered = { ...params };
  AUX4_PARAMS.forEach(param => delete filtered[param]);
  return filtered;
}

function outputError(errorOutput, isArray = true) {
  const output = isArray ? [errorOutput] : errorOutput;
  console.error(JSON.stringify(output));
}

function exitOnError(shouldIgnore) {
  if (!shouldIgnore) {
    process.exit(1);
  }
}

function parseInput(trimmedInput) {
  try {
    const parsed = JSON.parse(trimmedInput);
    validateRequest(parsed);
    return { type: 'single', data: parsed };
  } catch (singleJsonError) {
    const lines = trimmedInput.split("\n").filter(line => line.trim());
    if (lines.length > 1) {
      try {
        const items = lines.map(line => {
          const parsed = JSON.parse(line.trim());
          validateRequest(parsed);
          return parsed;
        });
        return { type: 'ndjson', data: items };
      } catch (ndjsonError) {
        throw singleJsonError;
      }
    }
    throw singleJsonError;
  }
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Request must be an object');
  }
  if (!request.action) {
    throw new Error('Request must have an action property');
  }
  if (!request.sql) {
    throw new Error('Request must have an sql property');
  }
}

function readStdinData() {
  return new Promise((resolve, reject) => {
    let inputData = "";
    process.stdin.setEncoding("utf8");
    
    process.stdin.on("data", chunk => {
      inputData += chunk;
    });
    
    process.stdin.on("end", () => resolve(inputData));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const databasePath = validateArgs();
  
  try {
    const inputData = await readStdinData();
    const trimmedInput = inputData.trim();
    
    if (!trimmedInput) {
      process.exit(4);
    }

    const parsedInput = parseInput(trimmedInput);
    
    if (parsedInput.type === 'single') {
      await processRequest(databasePath, parsedInput.data);
    } else {
      for (const item of parsedInput.data) {
        if (item.action && item.sql) {
          try {
            await processRequest(databasePath, item);
          } catch (error) {
            const errorOutput = createErrorOutput(item, item.sql, error.message);
            outputError(errorOutput, false);
          }
        }
      }
    }
  } catch (error) {
    const errorOutput = createErrorOutput(
      inputData ? inputData.trim() : null,
      'unknown',
      `Error parsing JSON input: ${error.message}`
    );
    outputError(errorOutput, false);
    process.exit(1);
  }
}

main();

async function processRequest(databasePath, request) {
  let db;

  try {
    db = new Database(databasePath);
  } catch (error) {
    const errorOutput = createErrorOutput(request, request?.sql, error.message);
    outputError(errorOutput, false);
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
        const errorOutput = createErrorOutput(request, request?.sql, `Unknown action: ${request.action}`);
        outputError(errorOutput, false);
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
  const sqlParams = filterAux4Params(params);

  try {
    const stmt = db.prepare(convertedSql);
    const rows = stmt.all(params);
    console.log(JSON.stringify(rows));
  } catch (error) {
    const errorOutput = createErrorOutput(sqlParams, request.sql, error.message);
    outputError(errorOutput);
    exitOnError(request.ignore);
  }
}

async function executeBatch(db, request) {
  if (request.tx) {
    await executeBatchWithTransaction(db, request);
  } else {
    await executeBatchWithoutTransaction(db, request);
  }
}

function processItemInBatch(stmt, item, request, errors) {
  try {
    const rows = stmt.all(item);
    return { success: true, rows };
  } catch (error) {
    const cleanItem = filterAux4Params(item);
    const errorOutput = createErrorOutput(cleanItem, request.sql, error.message);
    errors.push(errorOutput);
    return { success: false, error };
  }
}

function outputBatchResults(results, hasAnyResults, itemCount) {
  if (!hasAnyResults) {
    console.log(JSON.stringify({ success: true, count: itemCount }));
  } else {
    console.log(JSON.stringify(results));
  }
}

function handleBatchErrors(errors, request, fallbackError = null) {
  if (errors.length > 0) {
    console.error(JSON.stringify(errors));
  } else if (fallbackError) {
    const errorOutput = createErrorOutput(null, request.sql, fallbackError.message);
    outputError(errorOutput);
  }
  exitOnError(request.ignore);
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
        const result = processItemInBatch(stmt, item, request, errors);
        if (result.success) {
          results.push(...result.rows);
          if (result.rows.length > 0) {
            hasAnyResults = true;
          }
        } else {
          throw result.error;
        }
      }

      return { results, hasAnyResults };
    });

    const { results, hasAnyResults } = transaction(request.items);
    outputBatchResults(results, hasAnyResults, request.items.length);
  } catch (error) {
    handleBatchErrors(errors, request, error);
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
    const errorOutput = createErrorOutput(null, request.sql, error.message);
    outputError(errorOutput);
    exitOnError(request.ignore);
    return;
  }

  for (const item of request.items) {
    const result = processItemInBatch(stmt, item, request, errors);
    if (result.success) {
      results.push(...result.rows);
      if (result.rows.length > 0) {
        hasAnyResults = true;
      }
    }
  }

  if (errors.length > 0) {
    console.error(JSON.stringify(errors));
    exitOnError(request.ignore);
  }

  if (!hasAnyResults && errors.length === 0) {
    outputBatchResults([], false, request.items.length);
  } else if (hasAnyResults) {
    outputBatchResults(results, true, request.items.length);
  }
}

function streamRows(rows) {
  rows.forEach(row => {
    console.log(JSON.stringify(row));
  });
}

async function streamQuery(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  const params = request.params || {};
  const sqlParams = filterAux4Params(params);

  try {
    const stmt = db.prepare(convertedSql);
    const rows = stmt.all(params);
    streamRows(rows);
  } catch (error) {
    const errorOutput = createErrorOutput(sqlParams, request.sql, error.message);
    outputError(errorOutput, false);
    exitOnError(request.ignore);
  }
}

function processStreamItem(stmt, item, request) {
  try {
    const rows = stmt.all(item);
    streamRows(rows);
    return { success: true };
  } catch (error) {
    const cleanItem = filterAux4Params(item);
    const errorOutput = createErrorOutput(cleanItem, request.sql, error.message);
    outputError(errorOutput, false);
    return { success: false, error };
  }
}

async function streamBatch(db, request) {
  const convertedSql = convertParameterSyntax(request.sql);
  
  try {
    const stmt = db.prepare(convertedSql);
    
    if (request.tx) {
      const transaction = db.transaction(items => {
        for (const item of items) {
          const result = processStreamItem(stmt, item, request);
          if (!result.success && !request.ignore) {
            throw result.error;
          }
        }
      });
      transaction(request.items);
    } else {
      for (const item of request.items) {
        processStreamItem(stmt, item, request);
      }
    }
  } catch (error) {
    const errorOutput = createErrorOutput(null, request.sql, error.message);
    outputError(errorOutput, false);
    exitOnError(request.ignore);
  }
}
