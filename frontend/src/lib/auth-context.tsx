import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  requestOtp: (email: string, purpose: 'register' | 'login') => Promise<{ message: string; devOtp?: string }>;
  verifyOtp: (email: string, otp: string, purpose: 'register' | 'login') => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const BASE_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

function persistSession(user: User, token: string) {
  localStorage.setItem('research_user', JSON.stringify(user));
  localStorage.setItem('research_token', token);
}

function clearSession() {
  localStorage.removeItem('research_user');
  localStorage.removeItem('research_token');
  localStorage.removeItem('research_refresh_token');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('research_user');
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('research_token'));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem('research_refresh_token'));

  const requestOtp = useCallback(async (email: string, purpose: 'register' | 'login') => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Email is required');

    const res = await fetch(`${BASE_URL}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, purpose }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

    return { message: data.message || 'OTP sent successfully', devOtp: data.dev_otp };
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string, purpose: 'register' | 'login') => {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanedOtp = otp.trim();
    if (!normalizedEmail || !cleanedOtp) throw new Error('Email and OTP are required');

    const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, otp: cleanedOtp, purpose }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'OTP verification failed');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid credentials');
    setUser(data.user);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    persistSession(data.user, data.token);
    localStorage.setItem('research_refresh_token', data.refreshToken);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setUser(data.user);
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    persistSession(data.user, data.token);
    localStorage.setItem('research_refresh_token', data.refreshToken);
  }, []);

  const logout = useCallback(() => {
    const rt = localStorage.getItem('research_refresh_token');
    setUser(null);
    setToken(null);
    setRefreshToken(null);
    clearSession();
    // Best-effort revoke of refresh token
    if (rt) {
      fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      }).catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, refreshToken, isAuthenticated: !!user, requestOtp, verifyOtp, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
