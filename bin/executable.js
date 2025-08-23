import fs from 'fs';
import Database from '../index.js';

async function main() {
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
      const chunks = [];
      let totalLength = 0;

      process.stdin.on('data', chunk => {
        chunks.push(chunk);
        totalLength += chunk.length;
      });

      process.stdin.on('end', async () => {
        try {
          const input = Buffer.concat(chunks, totalLength).toString('utf8').trim();
          
          let items;
          if (input.startsWith('[') || input.startsWith('{') && !input.includes('\n')) {
            // Regular JSON array or single object
            const data = JSON.parse(input);
            items = Array.isArray(data) ? data : [data];
          } else {
            // JSON Lines format (JSONL) - each line is a separate JSON object
            items = input.split('\n')
              .filter(line => line.trim())
              .map(line => JSON.parse(line.trim()));
          }

          if (action === 'execute') {
            if (items.length > 1) {
              // Use batch operation for multiple items
              const paramsList = items.map(item => ({ ...item, ...params }));
              const result = await db.executeBatch(sql, paramsList);
              console.log(JSON.stringify(result.data));
            } else {
              // Single item execution
              const mergedParams = { ...items[0], ...params };
              const result = await db.execute(sql, mergedParams);
              console.log(JSON.stringify(Array.isArray(result.data) ? result.data : [result.data]));
            }
          } else if (action === 'stream') {
            for (const item of items) {
              const mergedParams = { ...item, ...params };
              // For INSERT/UPDATE/DELETE with RETURNING, use execute
              if (sql.trim().toUpperCase().match(/^(INSERT|UPDATE|DELETE|REPLACE).*RETURNING/i)) {
                const result = await db.execute(sql, mergedParams);
                if (Array.isArray(result.data)) {
                  for (const row of result.data) {
                    console.log(JSON.stringify(row));
                  }
                }
              } else {
                // For SELECT queries, use stream
                const stream = await db.stream(sql, mergedParams);
                for await (const row of stream) {
                  console.log(JSON.stringify(row));
                }
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
        // For INSERT/UPDATE/DELETE with RETURNING, use execute
        if (sql.trim().toUpperCase().match(/^(INSERT|UPDATE|DELETE|REPLACE).*RETURNING/i)) {
          const result = await db.execute(sql, params);
          if (Array.isArray(result.data)) {
            for (const row of result.data) {
              console.log(JSON.stringify(row));
            }
          }
        } else {
          // For SELECT queries, use stream
          const stream = await db.stream(sql, params);
          for await (const row of stream) {
            console.log(JSON.stringify(row));
          }
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