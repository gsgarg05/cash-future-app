# Cash–Future Table

A real-time Cash–Future spread table showing every stock that has both an NSECM
cash contract and a nearest-expiry NSEFO stock future (FUTSTK). Prices stream
live over WebSocket and update once per second.

**Live demo:** https://backend-production-b431.up.railway.app

## Columns

| Column | Meaning |
|--------|---------|
| Symbol | Stock symbol |
| Stock LTP | Latest traded price of the stock (NSECM) |
| Future LTP | Latest traded price of the nearest-expiry future (NSEFO) |
| Buy Spread | Future Bid − Stock Ask |
| Sell Spread | Stock Bid − Future Ask |

## Stack

- **Frontend:** React + AG Grid (served as a static build by the backend)
- **Backend:** Node.js, `ws` WebSocket server
- **Database:** PostgreSQL (contract master data)
- **Hosting:** Railway

## How it works

1. `seed.js` reads the two contract master files and stores them in PostgreSQL
   (`cm_contracts` = NSECM cash, `fo_contracts` = NSEFO FUTSTK only).
2. On startup the backend joins the two tables on `symbol`, keeping the future
   with the **minimum expiry date** per stock — so only stocks with both a cash
   and a nearest future appear.
3. The market data CSVs are matched to contracts by `token`. The backend keeps
   the latest bid/ask/ltp per token in memory and broadcasts the computed table
   every second over WebSocket.
4. When a market data file ends, reading loops back to the beginning.
5. `315513000` is added to expiry/timestamp values to get correct UTC.

## Running locally

```bash
# 1. install deps
npm install
cd frontend && npm install && cd ..

# 2. configure the database (see .env.example)
cp .env.example .env      # then fill in your Postgres credentials

# 3. seed contract data
node seed.js

# 4. build the frontend
cd frontend && npm run build && cd ..

# 5. start the server (serves frontend + WebSocket on port 8080)
node server.js
```

For live-reload frontend development, run `npm run dev` inside `frontend/`
(it connects to `ws://localhost:8080`).

## Market data files

The two large market-data CSVs (~930MB total) exceed GitHub's 100MB file limit,
so they are **not** committed to this repo. They are published as a GitHub
Release asset and downloaded automatically by the backend on first boot (see
`CM_DATA_URL` / `FO_DATA_URL` in `.env.example`). To run fully locally, place
these files in `task/`:

- `nsecm_market_data.csv`
- `nsefo_market_data.csv`
