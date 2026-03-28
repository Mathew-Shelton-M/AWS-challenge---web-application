import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCategories, createCategory, renameCategory, deleteCategory } from '../api/categories';
import { useAuth } from '../hooks/useAuth';

export default function CategoriesPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewName('');
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
      setEditingName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDeleteError(null);
    },
    onError: (err: Error) => {
      if (err.message === 'CONFLICT') {
        setDeleteError(
          'Cannot delete: this category has products assigned to it. Reassign or delete those products first.'
        );
      } else {
        setDeleteError('Failed to delete category. Please try again.');
      }
    },
  });

  if ((error as Error)?.message === 'UNAUTHORIZED') {
    logout();
    return null;
  }

  if (isLoading) {
    return <div style={styles.centered}>Loading categories...</div>;
  }

  if (isError) {
    return <div style={styles.centered}>Failed to load categories. Please try again.</div>;
  }

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const handleRenameStart = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
    setDeleteError(null);
  };

  const handleRenameSubmit = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    renameMutation.mutate({ id, name: trimmed });
  };

  const handleDelete = (id: string) => {
    setDeleteError(null);
    deleteMutation.mutate(id);
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Categories</h1>

      {/* Inline create form */}
      <div style={styles.createRow}>
        <input
          style={styles.input}
          type="text"
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={createMutation.isPending}
        />
        <button
          style={{
            ...styles.btnPrimary,
            ...(createMutation.isPending ? styles.btnDisabled : {}),
          }}
          onClick={handleCreate}
          disabled={createMutation.isPending || !newName.trim()}
        >
          {createMutation.isPending ? 'Adding...' : 'Add'}
        </button>
      </div>

      {deleteError && <div style={styles.errorBanner}>{deleteError}</div>}

      {data!.length === 0 ? (
        <p style={styles.empty}>No categories yet. Add one above.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={{ ...styles.th, width: '180px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data!.map((cat) => (
              <tr key={cat.id} style={styles.tr}>
                <td style={styles.td}>
                  {editingId === cat.id ? (
                    <input
                      style={styles.input}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(cat.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      disabled={renameMutation.isPending}
                    />
                  ) : (
                    <span style={styles.catName}>{cat.name}</span>
                  )}
                </td>
                <td style={styles.td}>
                  {editingId === cat.id ? (
                    <div style={styles.actionGroup}>
                      <button
                        style={{
                          ...styles.btnPrimary,
                          ...styles.btnSm,
                          ...(renameMutation.isPending ? styles.btnDisabled : {}),
                        }}
                        onClick={() => handleRenameSubmit(cat.id)}
                        disabled={renameMutation.isPending || !editingName.trim()}
                      >
                        Save
                      </button>
                      <button
                        style={{ ...styles.btnSecondary, ...styles.btnSm }}
                        onClick={() => setEditingId(null)}
                        disabled={renameMutation.isPending}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={styles.actionGroup}>
                      <button
                        style={{ ...styles.btnSecondary, ...styles.btnSm }}
                        onClick={() => handleRenameStart(cat.id, cat.name)}
                      >
                        Rename
                      </button>
                      <button
                        style={{
                          ...styles.btnDanger,
                          ...styles.btnSm,
                          ...(deleteMutation.isPending ? styles.btnDisabled : {}),
                        }}
                        onClick={() => handleDelete(cat.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '32px',
    maxWidth: '720px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#111',
    margin: '0 0 24px',
  },
  createRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    color: '#b91c1c',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  empty: {
    fontSize: '14px',
    color: '#666',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#555',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#111',
    verticalAlign: 'middle',
  },
  catName: {
    fontWeight: 500,
  },
  actionGroup: {
    display: 'flex',
    gap: '8px',
  },
  btnPrimary: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  btnSm: {
    padding: '6px 12px',
    fontSize: '13px',
  },
  btnDisabled: {
    opacity: 0.6,
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
