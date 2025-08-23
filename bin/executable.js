import fs from 'fs';
import Database from '../index.js';

function parseArguments() {
  const args = process.argv.slice(2);
  const action = args[0] || '';
  const database = args[1] || '';
  const query = args[2] || '';
  const file = args[3] || '';
  let inputStream = args[4] === 'true';
  const paramsArg = args[5] || '{}';

  if (!action || (action !== 'execute' && action !== 'stream')) {
    console.error('Usage: executable.js <execute|stream> <database> <query> <file> <inputStream> <params>');
    process.exit(1);
  }

  let params;
  try {
    params = JSON.parse(paramsArg);
  } catch (error) {
    console.error(`Error parsing params JSON: ${error.message}`);
    process.exit(1);
  }

  const additionalArgs = args.slice(6);
  
  for (let i = 0; i < additionalArgs.length; i += 2) {
    const key = additionalArgs[i];
    const value = additionalArgs[i + 1];
    if (key && value !== undefined) {
      let convertedValue = value;
      if (value === 'true') convertedValue = true;
      else if (value === 'false') convertedValue = false;
      else if (!isNaN(value) && !isNaN(parseFloat(value))) convertedValue = parseFloat(value);
      
      params[key] = convertedValue;
    }
  }

  if (!database) {
    console.error('Database path is required');
    process.exit(1);
  }

  return { action, database, query, file, inputStream, params };
}

function loadSQL(query, file) {
  let sql = query;
  if (!sql && file) {
    try {
      sql = fs.readFileSync(file, 'utf8');
    } catch (error) {
      console.error(`Error reading SQL file: ${error.message}`);
      process.exit(1);
    }
  }

  if (!sql) {
    console.error('Either query or file parameter must be provided');
    process.exit(1);
  }

  return sql;
}

function parseInputData(input) {
  let items;
  if (input.startsWith('[') || input.startsWith('{') && !input.includes('\n')) {
    const data = JSON.parse(input);
    items = Array.isArray(data) ? data : [data];
  } else {
    items = input.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line.trim()));
  }
  return items;
}

async function executeWithItems(db, sql, items, params) {
  if (items.length > 1) {
    const paramsList = items.map(item => ({ ...item, ...params }));
    const result = await db.executeBatch(sql, paramsList);
    console.log(JSON.stringify(result.data));
  } else {
    const mergedParams = { ...items[0], ...params };
    const result = await db.execute(sql, mergedParams);
    console.log(JSON.stringify(Array.isArray(result.data) ? result.data : [result.data]));
  }
}

async function streamWithItems(db, sql, items, params) {
  for (const item of items) {
    const mergedParams = { ...item, ...params };
    if (sql.trim().toUpperCase().match(/^(INSERT|UPDATE|DELETE|REPLACE).*RETURNING/i)) {
      const result = await db.execute(sql, mergedParams);
      if (Array.isArray(result.data)) {
        for (const row of result.data) {
          console.log(JSON.stringify(row));
        }
      }
    } else {
      const stream = await db.stream(sql, mergedParams);
      for await (const row of stream) {
        console.log(JSON.stringify(row));
      }
    }
  }
}

async function processInputStream(db, sql, action, params) {
  const chunks = [];

  process.stdin.on('data', chunk => {
    chunks.push(chunk);
  });

  process.stdin.on('end', async () => {
    try {
      const input = Buffer.concat(chunks).toString('utf8').trim();
      const items = parseInputData(input);

      if (action === 'execute') {
        await executeWithItems(db, sql, items, params);
      } else if (action === 'stream') {
        await streamWithItems(db, sql, items, params);
      }
    } catch (error) {
      console.error(`Error processing input: ${error.message}`);
      process.exit(1);
    } finally {
      await db.close();
    }
  });
}

async function executeQuery(db, sql, params) {
  const result = await db.execute(sql, params);
  console.log(JSON.stringify(result.data));
}

async function streamQuery(db, sql, params) {
  if (sql.trim().toUpperCase().match(/^(INSERT|UPDATE|DELETE|REPLACE).*RETURNING/i)) {
    const result = await db.execute(sql, params);
    if (Array.isArray(result.data)) {
      for (const row of result.data) {
        console.log(JSON.stringify(row));
      }
    }
  } else {
    const stream = await db.stream(sql, params);
    for await (const row of stream) {
      console.log(JSON.stringify(row));
    }
  }
}

async function main() {
  const { action, database, query, file, inputStream, params } = parseArguments();
  const sql = loadSQL(query, file);
  const db = new Database({ database });
  
  try {
    await db.open();

    if (inputStream) {
      await processInputStream(db, sql, action, params);
    } else {
      if (action === 'execute') {
        await executeQuery(db, sql, params);
      } else if (action === 'stream') {
        await streamQuery(db, sql, params);
      }
      await db.close();
    }
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`Unexpected error: ${error.message}`);
  process.exit(1);
});