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

Please follow the steps below to run locally:

### Prerequisites

Install these first:
- Node.js v18+
- PostgreSQL
- Git

### 1. Clone the repo

```bash
git clone https://github.com/gsgarg05/cash-future-app.git
cd cash-future-app
```

### 2. Create the database and user

```bash
psql postgres -c "CREATE USER cashfuture WITH PASSWORD 'cashfuture123';"
psql postgres -c "CREATE DATABASE cash_future OWNER cashfuture;"
```

### 3. Create a `.env` file in the project root folder

Paste this in the `.env` file:

```
DB_HOST=localhost
DB_NAME=cash_future
DB_USER=cashfuture
DB_PASSWORD=cashfuture123
DB_PORT=5432
CM_DATA_URL=https://github.com/gsgarg05/cash-future-app/releases/download/market-data/nsecm_market_data.csv
FO_DATA_URL=https://github.com/gsgarg05/cash-future-app/releases/download/market-data/nsefo_market_data.csv
PORT=8080
```

### 4. Install dependencies and build the frontend

Run the commands:

```bash
npm install
cd frontend && npm install && npm run build && cd ..
```

### 5. Seed the database (loads contract data into the postgres db)

Run the command:

```bash
node seed.js
```

### 6. Start the app

Run the command:

```bash
node server.js
```

(This command may take around a minute or so to run as it has to fetch the
high size CSV files from GitHub.) Wait until you see `Server running on port 8080`.

### 7. Open in your browser

The webpage will be live on:

```
http://localhost:8080
```

## Market data files

The two large market-data CSVs (~930MB total) exceed GitHub's 100MB file limit,
so they are **not** committed to this repo. They are published as a GitHub
Release asset and downloaded automatically by the backend on first boot (see
`CM_DATA_URL` / `FO_DATA_URL` in `.env.example`). To run fully locally, place
these files in `task/`:

- `nsecm_market_data.csv`
- `nsefo_market_data.csv`
