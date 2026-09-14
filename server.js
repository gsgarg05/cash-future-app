const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const readline = require('readline');
const WebSocket = require('ws');
const pool = require('./db');

const FRONTEND_DIR = path.join(__dirname, 'frontend', 'dist');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(FRONTEND_DIR, urlPath);
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback — serve index.html for unknown routes
      fs.readFile(path.join(FRONTEND_DIR, 'index.html'), (e2, html) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const marketData = {};
let pairs = [];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed ${response.statusCode} for ${url}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function ensureMarketFile(filePath, url) {
  if (fs.existsSync(filePath)) {
    console.log(`Found ${filePath}`);
    return;
  }
  if (!url) throw new Error(`Missing ${filePath} and no download URL provided`);
  console.log(`Downloading ${filePath} from ${url}...`);
  await downloadFile(url, filePath);
  console.log(`Downloaded ${filePath}`);
}

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

async function loadFilteredData(filePath, validTokens) {
  console.log(`Loading ${filePath}...`);
  const tokens = [];
  const bids = [];
  const asks = [];
  const ltps = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath)
  });

  for await (const line of rl) {
    const cols = line.split(',');
    const token = parseInt(cols[0]);
    if (!validTokens.has(token)) continue;
    tokens.push(token);
    bids.push(parseFloat(cols[2]));
    asks.push(parseFloat(cols[3]));
    ltps.push(parseFloat(cols[4]));
  }

  console.log(`Kept ${tokens.length} relevant rows from ${filePath}`);
  return {
    tokens: Int32Array.from(tokens),
    bids: Float64Array.from(bids),
    asks: Float64Array.from(asks),
    ltps: Float64Array.from(ltps),
    length: tokens.length,
  };
}

function applyRow(data, i) {
  const token = data.tokens[i];
  marketData[token] = { bid: data.bids[i], ask: data.asks[i], ltp: data.ltps[i] };
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
  const cmPath = `${dataDir}/nsecm_market_data.csv`;
  const foPath = `${dataDir}/nsefo_market_data.csv`;

  await ensureMarketFile(cmPath, process.env.CM_DATA_URL);
  await ensureMarketFile(foPath, process.env.FO_DATA_URL);

  const cmData = await loadFilteredData(cmPath, cmTokens);
  const foData = await loadFilteredData(foPath, foTokens);

  let cmIndex = 0;
  let foIndex = 0;

  const port = process.env.PORT || 8080;
  const server = http.createServer(serveStatic);
  const wss = new WebSocket.Server({ server });
  server.listen(port, () => console.log(`Server running on port ${port}`));

  wss.on('connection', ws => {
    ws.send(JSON.stringify(buildBroadcastData()));
  });

  const BATCH_SIZE = 1000;

  setInterval(() => {
    for (let i = 0; i < BATCH_SIZE && cmData.length > 0; i++) {
      applyRow(cmData, cmIndex);
      cmIndex = (cmIndex + 1) % cmData.length;
    }

    for (let i = 0; i < BATCH_SIZE && foData.length > 0; i++) {
      applyRow(foData, foIndex);
      foIndex = (foIndex + 1) % foData.length;
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
