import { useEffect, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, colorSchemeDark } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withPart(colorSchemeDark);

function SpreadCell({ value }) {
  if (value == null) return <span style={{ color: '#666' }}>—</span>;
  const color = value >= 0 ? '#00e676' : '#ff5252';
  const prefix = value >= 0 ? '+' : '';
  return <span style={{ color, fontWeight: 600 }}>{prefix}{value.toFixed(2)}</span>;
}

function PriceCell({ value }) {
  if (value == null) return <span style={{ color: '#666' }}>—</span>;
  return <span>{value.toFixed(2)}</span>;
}

const columns = [
  {
    field: 'symbol',
    headerName: 'Symbol',
    flex: 1,
    cellStyle: { fontWeight: 700, color: '#90caf9' },
  },
  { field: 'stockLtp',   headerName: 'Stock LTP',   flex: 1, cellRenderer: PriceCell },
  { field: 'futureLtp',  headerName: 'Future LTP',  flex: 1, cellRenderer: PriceCell },
  { field: 'buySpread',  headerName: 'Buy Spread',  flex: 1, cellRenderer: SpreadCell },
  { field: 'sellSpread', headerName: 'Sell Spread', flex: 1, cellRenderer: SpreadCell },
];

export default function App() {
  const [rowData, setRowData] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      (window.location.protocol === 'https:'
        ? `wss://${window.location.host}`
        : 'ws://localhost:8080');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setRowData(data);
    };
    ws.onerror = (err) => console.error('WebSocket error:', err);
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  return (
    <div style={{
      height: '100vh',
      backgroundColor: '#121212',
      color: '#e0e0e0',
      padding: '24px',
      fontFamily: 'monospace',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, color: '#ffffff', fontSize: '20px' }}>Cash–Future Table</h2>
        <span style={{
          fontSize: '12px',
          padding: '2px 10px',
          borderRadius: '12px',
          backgroundColor: connected ? '#1b5e20' : '#b71c1c',
          color: connected ? '#00e676' : '#ff5252',
        }}>
          {connected ? '● LIVE' : '● DISCONNECTED'}
        </span>
      </div>

      <div style={{ height: 'calc(100% - 60px)' }}>
        <AgGridReact
          theme={darkTheme}
          rowData={rowData}
          columnDefs={columns}
          getRowId={(params) => params.data.symbol}
          rowHeight={40}
          headerHeight={44}
        />
      </div>
    </div>
  );
}
