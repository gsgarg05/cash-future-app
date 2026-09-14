const fs = require('fs');
const readline = require('readline');
const pool = require('./db');

async function createTables() {
  const schema = `
    token           INTEGER PRIMARY KEY,
    instrument_type VARCHAR(20),
    symbol          VARCHAR(50),
    expiry_date     BIGINT,
    contract_name   VARCHAR(100)
  `;
  await pool.query(`CREATE TABLE IF NOT EXISTS cm_contracts (${schema})`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fo_contracts (${schema})`);
  console.log('Tables ready');
}

async function insertBatch(tableName, rows) {
  if (rows.length === 0) return;

  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * 5;
    values.push(row.token, row.instrType, row.symbol, row.expiryDate, row.contractName);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await pool.query(
    `INSERT INTO ${tableName} VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
    values
  );
}

async function seedContracts(filePath, tableName, filterType) {
  console.log(`Seeding ${tableName}...`);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath)
  });

  const BATCH_SIZE = 500;
  let batch = [];

  for await (const line of rl) {
    const cols = line.trim().split(/\s+/);

    if (filterType && cols[2] !== filterType) continue;

    batch.push({
      token:        parseInt(cols[0]),
      instrType:    cols[2],
      symbol:       cols[3],
      expiryDate:   parseInt(cols[4]) + 315513000,
      contractName: cols[13],
    });

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(tableName, batch);
      batch = [];
    }
  }

  await insertBatch(tableName, batch);

  console.log(`${tableName} done`);
}

async function main() {
  const dataDir = process.env.DATA_DIR || './task';
  await createTables();
  await seedContracts(`${dataDir}/nse_cm_ref_contract_master.csv`, 'cm_contracts', null);
  await seedContracts(`${dataDir}/nse_fo_ref_contract_master.csv`, 'fo_contracts', 'FUTSTK');
  await pool.end();
  console.log('Seeding complete!');
}

main().catch(console.error);
