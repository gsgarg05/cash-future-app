const fs = require('fs');
const readline = require('readline');
const pool = require('./db');

async function seedContracts(filePath, tableName, filterType) {
  console.log(`Seeding ${tableName}...`);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath)
  });

  for await (const line of rl) {
    const cols = line.trim().split(/\s+/);

    if (filterType && cols[2] !== filterType) continue;

    const token        = parseInt(cols[0]);
    const instrType    = cols[2];
    const symbol       = cols[3];
    const expiryDate   = parseInt(cols[4]) + 315513000;
    const contractName = cols[13];

    await pool.query(
      `INSERT INTO ${tableName} VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [token, instrType, symbol, expiryDate, contractName]
    );
  }

  console.log(`${tableName} done`);
}

async function main() {
  const dataDir = process.env.DATA_DIR || './task';
  await seedContracts(`${dataDir}/nse_cm_ref_contract_master.csv`, 'cm_contracts', null);
  await seedContracts(`${dataDir}/nse_fo_ref_contract_master.csv`, 'fo_contracts', 'FUTSTK');
  await pool.end();
  console.log('Seeding complete!');
}

main().catch(console.error);
