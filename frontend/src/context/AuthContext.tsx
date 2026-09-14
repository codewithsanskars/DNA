import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types';
import { authApi } from '../api/auth.api';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  /** True for a moment right after a fresh sign-in (not a resumed session) — drives the post-login logo animation. */
  justSignedIn: boolean;
  dismissJustSignedIn: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('swfs_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [justSignedIn, setJustSignedIn] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('swfs_token');
    if (storedToken) {
      authApi
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('swfs_token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  // Handle SSO callback token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    if (callbackToken && window.location.pathname === '/auth/callback') {
      localStorage.setItem('swfs_token', callbackToken);
      setToken(callbackToken);
      window.history.replaceState({}, '', '/');
      authApi
        .me()
        .then((u) => {
          setUser(u);
          setJustSignedIn(true);
        })
        .finally(() => setIsLoading(false));
    }
  }, []);

  const login = async (email: string) => {
    const result = await authApi.login(email);
    localStorage.setItem('swfs_token', result.token);
    setToken(result.token);
    setUser(result.user);
    setJustSignedIn(true);
  };

  const logout = () => {
    localStorage.removeItem('swfs_token');
    setToken(null);
    setUser(null);
  };

  const dismissJustSignedIn = () => setJustSignedIn(false);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, justSignedIn, dismissJustSignedIn }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
