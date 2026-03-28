import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchProducts, deleteProduct, type Product, type ProductFilters } from '../api/products';
import { useAuth } from '../hooks/useAuth';

function stockBadgeColor(status: Product['stockStatus']): string {
  switch (status) {
    case 'In Stock': return '#16a34a';
    case 'Low Stock': return '#d97706';
    case 'Out of Stock': return '#dc2626';
  }
}

function expiryBadgeColor(status: Product['expiryStatus']): string {
  switch (status) {
    case 'Valid': return '#16a34a';
    case 'Near Expiry': return '#d97706';
    case 'Expired': return '#dc2626';
    default: return '#6b7280';
  }
}

function formatLocation(product: Product): string {
  const parts = [product.rack, product.shelf, product.section].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Location not set';
}

export default function ProductsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');

  // Debounce search input 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters: ProductFilters = {
    q: debouncedSearch || undefined,
    stockStatus: stockStatus || undefined,
    expiryStatus: expiryStatus || undefined,
  };

  const { data: products, isLoading, isError, error } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => fetchProducts(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  if ((error as Error)?.message === 'UNAUTHORIZED' || (deleteMutation.error as Error)?.message === 'UNAUTHORIZED') {
    logout();
    return null;
  }

  const hasFilters = !!debouncedSearch || !!stockStatus || !!expiryStatus;

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setStockStatus('');
    setExpiryStatus('');
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Products</h1>
        <button style={styles.newButton} onClick={() => navigate('/products/new')}>
          + New Product
        </button>
      </div>

      {/* Search + Filter bar */}
      <div style={styles.toolbar}>
        <input
          type="text"
          placeholder="Search by name or category..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={styles.searchInput}
        />

        <select value={stockStatus} onChange={(e) => setStockStatus(e.target.value)} style={styles.select}>
          <option value="">All Stock Statuses</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>

        <select value={expiryStatus} onChange={(e) => setExpiryStatus(e.target.value)} style={styles.select}>
          <option value="">All Expiry Statuses</option>
          <option value="Valid">Valid</option>
          <option value="Near Expiry">Near Expiry</option>
          <option value="Expired">Expired</option>
        </select>

        {hasFilters && (
          <button onClick={clearFilters} style={styles.clearButton}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table area */}
      {isLoading ? (
        <div style={styles.centered}>Loading products...</div>
      ) : isError ? (
        <div style={styles.centered}>Failed to load products. Please try again.</div>
      ) : products!.length === 0 ? (
        <div style={styles.centered}>No products found.</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Name', 'Category', 'Quantity', 'Stock Status', 'Expiry Status', 'Location', 'Actions'].map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products!.map((product) => (
                <tr key={product.id} style={styles.tr}>
                  <td style={styles.td}>{product.name}</td>
                  <td style={styles.td}>{product.categoryName}</td>
                  <td style={styles.td}>{product.quantity}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, backgroundColor: stockBadgeColor(product.stockStatus) }}>
                      {product.stockStatus}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {product.expiryStatus ? (
                      <span style={{ ...styles.badge, backgroundColor: expiryBadgeColor(product.expiryStatus) }}>
                        {product.expiryStatus}
                      </span>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </td>
                  <td style={{ ...styles.td, color: product.rack || product.shelf || product.section ? '#111' : '#9ca3af' }}>
                    {formatLocation(product)}
                  </td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      <button
                        style={styles.editButton}
                        onClick={() => navigate(`/products/${product.id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        style={{
                          ...styles.deleteButton,
                          ...(deleteMutation.isPending ? styles.disabledButton : {}),
                        }}
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${product.name}"?`)) {
                            deleteMutation.mutate(product.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '32px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  pageHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  newButton: {
    padding: '9px 18px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '20px',
  },
  searchInput: {
    flex: '1 1 220px',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  clearButton: {
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  tableWrapper: {
    overflowX: 'auto',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontWeight: 600,
    color: '#374151',
    borderBottom: '2px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    color: '#111',
    verticalAlign: 'middle',
  },
  badge: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#fff',
    borderRadius: '4px',
    padding: '2px 8px',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: '#9ca3af',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  editButton: {
    padding: '5px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '5px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  disabledButton: {
    opacity: 0.5,
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
};
