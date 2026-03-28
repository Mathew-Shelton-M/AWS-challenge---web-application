import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDashboard, acknowledgeAlert, type Alert } from '../api/dashboard';
import { useAuth } from '../hooks/useAuth';

function formatAlertType(alertType: Alert['alertType']): string {
  switch (alertType) {
    case 'low_stock': return 'Low Stock';
    case 'out_of_stock': return 'Out of Stock';
    case 'near_expiry': return 'Near Expiry';
    case 'expired': return 'Expired';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function DashboardPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if ((error as Error)?.message === 'UNAUTHORIZED' || (acknowledgeMutation.error as Error)?.message === 'UNAUTHORIZED') {
    logout();
    return null;
  }

  if (isLoading) {
    return <div style={styles.centered}>Loading dashboard...</div>;
  }

  if (isError) {
    return <div style={styles.centered}>Failed to load dashboard. Please try again.</div>;
  }

  const cards = [
    { label: 'Total Products', value: data!.totalProducts, color: '#2563eb' },
    { label: 'Low Stock', value: data!.lowStockCount, color: '#d97706' },
    { label: 'Out of Stock', value: data!.outOfStockCount, color: '#dc2626' },
    { label: 'Near Expiry', value: data!.nearExpiryCount, color: '#7c3aed' },
    { label: 'Expired', value: data!.expiredCount, color: '#6b7280' },
  ];

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Dashboard</h1>

      <div style={styles.cardGrid}>
        {cards.map((card) => (
          <div key={card.label} style={styles.card}>
            <div style={{ ...styles.cardValue, color: card.color }}>{card.value}</div>
            <div style={styles.cardLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      <h2 style={styles.subheading}>Active Alerts</h2>

      {data!.activeAlerts.length === 0 ? (
        <p style={styles.noAlerts}>No active alerts.</p>
      ) : (
        <div style={styles.alertList}>
          {data!.activeAlerts.map((alert) => (
            <div key={alert.id} style={styles.alertRow}>
              <div style={styles.alertInfo}>
                <span style={styles.alertProduct}>{alert.productName}</span>
                <span style={{ ...styles.alertBadge, backgroundColor: badgeColor(alert.alertType) }}>
                  {formatAlertType(alert.alertType)}
                </span>
                <span style={styles.alertDate}>{formatDate(alert.generatedAt)}</span>
              </div>
              <button
                style={{
                  ...styles.ackButton,
                  ...(acknowledgeMutation.isPending ? styles.ackButtonDisabled : {}),
                }}
                disabled={acknowledgeMutation.isPending}
                onClick={() => acknowledgeMutation.mutate(alert.id)}
              >
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function badgeColor(alertType: Alert['alertType']): string {
  switch (alertType) {
    case 'low_stock': return '#d97706';
    case 'out_of_stock': return '#dc2626';
    case 'near_expiry': return '#7c3aed';
    case 'expired': return '#6b7280';
  }
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
  subheading: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#111',
    margin: '32px 0 16px',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: '20px',
    textAlign: 'center',
  },
  cardValue: {
    fontSize: '36px',
    fontWeight: 700,
    lineHeight: 1,
    marginBottom: '8px',
  },
  cardLabel: {
    fontSize: '13px',
    color: '#555',
    fontWeight: 500,
  },
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  alertRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    padding: '14px 16px',
  },
  alertInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  alertProduct: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111',
  },
  alertBadge: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#fff',
    borderRadius: '4px',
    padding: '2px 8px',
  },
  alertDate: {
    fontSize: '13px',
    color: '#666',
  },
  ackButton: {
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  ackButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px',
    fontSize: '15px',
    color: '#555',
  },
  noAlerts: {
    fontSize: '14px',
    color: '#666',
  },
};
