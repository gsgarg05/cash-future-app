const fs = require('fs');
const readline = require('readline');
const WebSocket = require('ws');
const pool = require('./db');

const marketData = {};
let pairs = [];

async function loadPairs() {
  const result = await pool.query(`
    SELECT
      c.symbol,
      c.token AS cm_token,
      f.token AS fo_token
    FROM cm_contracts c
    INNER JOIN fo_contracts f ON c.symbol = f.symbol
    WHERE f.expiry_date = (
      SELECT MIN(expiry_date)
      FROM fo_contracts
      WHERE symbol = f.symbol
    )
    AND c.symbol NOT LIKE '%NSETEST%'
  `);
  pairs = result.rows;
  console.log(`Loaded ${pairs.length} pairs`);
}

async function loadFilteredLines(filePath, validTokens) {
  console.log(`Loading ${filePath}...`);
  const lines = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath)
  });

  for await (const line of rl) {
    const token = parseInt(line.split(',')[0]);
    if (validTokens.has(token)) {
      lines.push(line);
    }
  }

  console.log(`Kept ${lines.length} relevant lines from ${filePath}`);
  return lines;
}

function parseLine(line) {
  const cols = line.split(',');
  return {
    token: parseInt(cols[0]),
    timestamp: parseInt(cols[1]) + 315513000,
    bid: parseFloat(cols[2]),
    ask: parseFloat(cols[3]),
    ltp: parseFloat(cols[4]),
  };
}

function buildBroadcastData() {
  return pairs.map(pair => {
    const stock = marketData[pair.cm_token] || {};
    const future = marketData[pair.fo_token] || {};

    const stockLtp   = stock.ltp  ?? null;
    const futureLtp  = future.ltp ?? null;
    const buySpread  = (future.bid != null && stock.ask != null) ? future.bid - stock.ask : null;
    const sellSpread = (stock.bid != null && future.ask != null) ? stock.bid - future.ask : null;

    return {
      symbol:     pair.symbol,
      stockLtp,
      futureLtp,
      buySpread,
      sellSpread,
    };
  });
}

async function main() {
  await loadPairs();

  const cmTokens = new Set(pairs.map(p => p.cm_token));
  const foTokens = new Set(pairs.map(p => p.fo_token));

  const dataDir = process.env.DATA_DIR || './task';
  const cmLines = await loadFilteredLines(`${dataDir}/nsecm_market_data.csv`, cmTokens);
  const foLines = await loadFilteredLines(`${dataDir}/nsefo_market_data.csv`, foTokens);

  let cmIndex = 0;
  let foIndex = 0;

  const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
  console.log(`WebSocket server running on port ${process.env.PORT || 8080}`);

  wss.on('connection', ws => {
    ws.send(JSON.stringify(buildBroadcastData()));
  });

  const BATCH_SIZE = 1000;

  setInterval(() => {
    for (let i = 0; i < BATCH_SIZE; i++) {
      if (cmLines.length > 0) {
        const cmLine = cmLines[cmIndex];
        if (cmLine) {
          const data = parseLine(cmLine);
          marketData[data.token] = { bid: data.bid, ask: data.ask, ltp: data.ltp };
        }
        cmIndex = (cmIndex + 1) % cmLines.length;
      }
    }

    for (let i = 0; i < BATCH_SIZE; i++) {
      if (foLines.length > 0) {
        const foLine = foLines[foIndex];
        if (foLine) {
          const data = parseLine(foLine);
          marketData[data.token] = { bid: data.bid, ask: data.ask, ltp: data.ltp };
        }
        foIndex = (foIndex + 1) % foLines.length;
      }
    }

    const payload = JSON.stringify(buildBroadcastData());
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }, 1000);
}

main().catch(console.error);
