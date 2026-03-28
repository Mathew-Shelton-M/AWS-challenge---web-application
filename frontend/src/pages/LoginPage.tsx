import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').min(3, 'Username must be at least 3 characters'),
  password: z.string().min(1, 'Password is required').min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const mutation = useMutation({
    mutationFn: ({ username, password }: LoginFormData) => login(username, password),
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      navigate('/dashboard');
    },
  });

  const onSubmit = (data: LoginFormData) => {
    mutation.mutate(data);
  };

  const getErrorMessage = () => {
    if (!mutation.error) return null;
    const err = mutation.error as Error;
    if (err.message === 'INVALID_CREDENTIALS') return 'Invalid username or password';
    return 'Unable to connect to server';
  };

  const apiError = getErrorMessage();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Smart Shop</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="username" style={styles.label}>Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              style={{
                ...styles.input,
                ...(errors.username ? styles.inputError : {}),
              }}
              {...register('username')}
            />
            {errors.username && (
              <span style={styles.fieldError}>{errors.username.message}</span>
            )}
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              style={{
                ...styles.input,
                ...(errors.password ? styles.inputError : {}),
              }}
              {...register('password')}
            />
            {errors.password && (
              <span style={styles.fieldError}>{errors.password.message}</span>
            )}
          </div>

          {apiError && (
            <div style={styles.apiError} role="alert">
              {apiError}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              ...styles.button,
              ...(mutation.isPending ? styles.buttonDisabled : {}),
            }}
          >
            {mutation.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: '16px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '24px',
    fontWeight: 700,
    color: '#111',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 28px',
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#333',
  },
  input: {
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s',
    color: '#111',
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#e53e3e',
  },
  fieldError: {
    fontSize: '12px',
    color: '#e53e3e',
  },
  apiError: {
    padding: '10px 12px',
    backgroundColor: '#fff5f5',
    border: '1px solid #fed7d7',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#c53030',
  },
  button: {
    padding: '11px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed',
  },
};
