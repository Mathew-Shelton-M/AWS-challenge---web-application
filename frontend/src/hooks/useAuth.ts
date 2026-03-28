import { useNavigate } from 'react-router-dom';

export function useAuth() {
  const navigate = useNavigate();

  const isAuthenticated = !!localStorage.getItem('accessToken');

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    navigate('/login');
  };

  return { isAuthenticated, logout };
}
