import fs from 'fs';
import Database from '../index.js';

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || '';
  const database = args[1] || '';
  const query = args[2] || '';
  const file = args[3] || '';
  let inputStream = args[4] === 'true';
  
  // Auto-detect if stdin has data
  if (!inputStream && !process.stdin.isTTY) {
    inputStream = true;
  }
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

  // Process additional arguments (key-value pairs)
  const additionalArgs = args.slice(6);
  
  for (let i = 0; i < additionalArgs.length; i += 2) {
    const key = additionalArgs[i];
    const value = additionalArgs[i + 1];
    if (key && value !== undefined) {
      // Convert string values to appropriate types
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


  const db = new Database({ database });
  
  try {
    await db.open();

    if (inputStream) {
      let input = '';
      process.stdin.on('data', chunk => {
        input += chunk;
      });

      process.stdin.on('end', async () => {
        try {
          const data = JSON.parse(input);
          const items = Array.isArray(data) ? data : [data];

          if (action === 'execute') {
            const results = [];
            for (const item of items) {
              const mergedParams = { ...item, ...params };
              const result = await db.execute(sql, mergedParams);
              results.push(result.data);
            }
            console.log(JSON.stringify(results));
          } else if (action === 'stream') {
            for (const item of items) {
              const mergedParams = { ...item, ...params };
              const stream = await db.stream(sql, mergedParams);
              for await (const row of stream) {
                console.log(JSON.stringify(row));
              }
            }
          }
        } catch (error) {
          console.error(`Error processing input: ${error.message}`);
          process.exit(1);
        } finally {
          await db.close();
        }
      });
    } else {
      if (action === 'execute') {
        const result = await db.execute(sql, params);
        console.log(JSON.stringify(result.data));
      } else if (action === 'stream') {
        const stream = await db.stream(sql, params);
        for await (const row of stream) {
          console.log(JSON.stringify(row));
        }
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