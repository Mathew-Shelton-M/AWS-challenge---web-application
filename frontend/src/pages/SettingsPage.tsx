import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type Settings } from '../api/settings';
import { useAuth } from '../hooks/useAuth';

export default function SettingsPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [nearExpiryWindowDays, setNearExpiryWindowDays] = useState(30);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [smsNotificationsEnabled, setSmsNotificationsEnabled] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [validationError, setValidationError] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });

  useEffect(() => {
    if (data) {
      setNearExpiryWindowDays(data.nearExpiryWindowDays);
      setEmailNotificationsEnabled(data.emailNotificationsEnabled);
      setSmsNotificationsEnabled(data.smsNotificationsEnabled);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings: Settings) => updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSuccessMsg('Settings saved');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
  });

  if ((error as Error)?.message === 'UNAUTHORIZED' || (mutation.error as Error)?.message === 'UNAUTHORIZED') {
    logout();
    return null;
  }

  if (isLoading) {
    return <div style={styles.centered}>Loading settings...</div>;
  }

  if (isError) {
    return <div style={styles.centered}>Failed to load settings. Please try again.</div>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    if (nearExpiryWindowDays < 1) {
      setValidationError('Near Expiry Window must be at least 1 day.');
      return;
    }
    mutation.mutate({ nearExpiryWindowDays, emailNotificationsEnabled, smsNotificationsEnabled });
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Settings</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label} htmlFor="nearExpiryWindow">
            Near Expiry Window (days)
          </label>
          <input
            id="nearExpiryWindow"
            type="number"
            min={1}
            value={nearExpiryWindowDays}
            onChange={(e) => setNearExpiryWindowDays(Number(e.target.value))}
            style={styles.numberInput}
          />
        </div>

        <div style={styles.field}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={emailNotificationsEnabled}
              onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>Enable Email Notifications</span>
          </label>
        </div>

        <div style={styles.field}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smsNotificationsEnabled}
              onChange={(e) => setSmsNotificationsEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>Enable SMS Notifications</span>
          </label>
        </div>

        {validationError && <p style={styles.errorMsg}>{validationError}</p>}
        {mutation.isError && !validationError && (
          <p style={styles.errorMsg}>Failed to save settings. Please try again.</p>
        )}
        {successMsg && <p style={styles.successMsg}>{successMsg}</p>}

        <button
          type="submit"
          style={{
            ...styles.saveButton,
            ...(mutation.isPending ? styles.saveButtonDisabled : {}),
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '32px',
    maxWidth: '480px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#111',
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    padding: '24px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#333',
  },
  numberInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    width: '120px',
  },
  saveButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  saveButtonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
  successMsg: {
    fontSize: '14px',
    color: '#16a34a',
    fontWeight: 500,
    margin: 0,
  },
  errorMsg: {
    fontSize: '14px',
    color: '#dc2626',
    fontWeight: 500,
    margin: 0,
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
