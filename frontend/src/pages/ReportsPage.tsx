import { useState } from 'react';
import {
  fetchStockUsage,
  fetchExpiryWastage,
  fetchTopRestocked,
  downloadReportCsv,
  type ReportType,
  type StockUsageRow,
  type ExpiryWastageRow,
  type TopRestockedRow,
} from '../api/reports';

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: toDateString(start), end: toDateString(end) };
}

const TABS: { id: ReportType; label: string }[] = [
  { id: 'stock-usage', label: 'Stock Usage' },
  { id: 'expiry-wastage', label: 'Expiry Wastage' },
  { id: 'top-restocked', label: 'Top Restocked' },
];

type ReportData = StockUsageRow[] | ExpiryWastageRow[] | TopRestockedRow[] | null;

export default function ReportsPage() {
  const dates = defaultDates();
  const [activeTab, setActiveTab] = useState<ReportType>('stock-usage');
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [data, setData] = useState<ReportData>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runReport() {
    setIsLoading(true);
    setError(null);
    setData(null);
    try {
      let result: ReportData;
      if (activeTab === 'stock-usage') {
        result = await fetchStockUsage(startDate, endDate);
      } else if (activeTab === 'expiry-wastage') {
        result = await fetchExpiryWastage(startDate, endDate);
      } else {
        result = await fetchTopRestocked(startDate, endDate);
      }
      setData(result);
    } catch (e) {
      setError((e as Error).message || 'Failed to load report');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownloadCsv() {
    setIsDownloading(true);
    try {
      await downloadReportCsv(activeTab, startDate, endDate);
    } catch (e) {
      setError((e as Error).message || 'Failed to download CSV');
    } finally {
      setIsDownloading(false);
    }
  }

  function handleTabChange(tab: ReportType) {
    setActiveTab(tab);
    setData(null);
    setError(null);
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Reports</h1>

      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date range + controls */}
      <div style={styles.controls}>
        <label style={styles.label}>
          Start Date
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.dateInput}
          />
        </label>
        <label style={styles.label}>
          End Date
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.dateInput}
          />
        </label>
        <button
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={runReport}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Run Report'}
        </button>
        <button
          style={{
            ...styles.btn,
            ...styles.btnSecondary,
            ...(isDownloading ? styles.btnDisabled : {}),
          }}
          onClick={handleDownloadCsv}
          disabled={isDownloading}
        >
          {isDownloading ? 'Downloading...' : 'Download CSV'}
        </button>
      </div>

      {/* Error */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Loading */}
      {isLoading && <div style={styles.centered}>Loading report...</div>}

      {/* Results */}
      {!isLoading && data !== null && (
        <>
          {data.length === 0 ? (
            <div style={styles.empty}>No data for the selected date range.</div>
          ) : (
            <div style={styles.tableWrapper}>
              {activeTab === 'stock-usage' && (
                <StockUsageTable rows={data as StockUsageRow[]} />
              )}
              {activeTab === 'expiry-wastage' && (
                <ExpiryWastageTable rows={data as ExpiryWastageRow[]} />
              )}
              {activeTab === 'top-restocked' && (
                <TopRestockedTable rows={data as TopRestockedRow[]} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StockUsageTable({ rows }: { rows: StockUsageRow[] }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Product Name</th>
          <th style={styles.th}>Total Added</th>
          <th style={styles.th}>Total Removed</th>
          <th style={styles.th}>Net Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId} style={styles.tr}>
            <td style={styles.td}>{row.productName}</td>
            <td style={{ ...styles.td, ...styles.tdNum }}>{row.totalAdded}</td>
            <td style={{ ...styles.td, ...styles.tdNum }}>{row.totalRemoved}</td>
            <td style={{ ...styles.td, ...styles.tdNum, color: row.netChange >= 0 ? '#16a34a' : '#dc2626' }}>
              {row.netChange >= 0 ? '+' : ''}{row.netChange}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExpiryWastageTable({ rows }: { rows: ExpiryWastageRow[] }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Product Name</th>
          <th style={styles.th}>Expiry Date</th>
          <th style={styles.th}>Quantity Wasted</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.productId}-${i}`} style={styles.tr}>
            <td style={styles.td}>{row.productName}</td>
            <td style={styles.td}>{new Date(row.expiryDate).toLocaleDateString()}</td>
            <td style={{ ...styles.td, ...styles.tdNum }}>{row.quantityWasted}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopRestockedTable({ rows }: { rows: TopRestockedRow[] }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Rank</th>
          <th style={styles.th}>Product Name</th>
          <th style={styles.th}>Restock Count</th>
          <th style={styles.th}>Total Added</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.productId} style={styles.tr}>
            <td style={{ ...styles.td, ...styles.tdNum }}>{i + 1}</td>
            <td style={styles.td}>{row.productName}</td>
            <td style={{ ...styles.td, ...styles.tdNum }}>{row.restockCount}</td>
            <td style={{ ...styles.td, ...styles.tdNum }}>{row.totalAdded}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '32px',
    maxWidth: '960px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#111',
    margin: '0 0 24px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    borderBottom: '2px solid #e5e7eb',
    paddingBottom: '0',
  },
  tab: {
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#555',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    borderRadius: '0',
  },
  tabActive: {
    color: '#2563eb',
    borderBottom: '2px solid #2563eb',
    fontWeight: 600,
  },
  controls: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '24px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
  },
  dateInput: {
    padding: '7px 10px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
  },
  btn: {
    padding: '8px 18px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#fff',
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '12px 16px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '120px',
    fontSize: '15px',
    color: '#555',
  },
  empty: {
    textAlign: 'center',
    padding: '48px 0',
    fontSize: '15px',
    color: '#6b7280',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    fontSize: '14px',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    color: '#111',
  },
  tdNum: {
    textAlign: 'right',
  },
};
