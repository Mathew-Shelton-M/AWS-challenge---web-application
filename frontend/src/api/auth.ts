export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 401) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!response.ok) {
    throw new Error('NETWORK_ERROR');
  }

  return response.json();
}
