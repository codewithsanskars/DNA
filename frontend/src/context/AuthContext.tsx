import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types';
import { authApi } from '../api/auth.api';

interface PendingOktaRegistration {
  pendingToken: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  /** True for a moment right after a fresh sign-in (not a resumed session) — drives the post-login logo animation. */
  justSignedIn: boolean;
  dismissJustSignedIn: () => void;
  /** Set when Okta confirmed a new identity but no local account exists yet — drives the "pick your organization" modal. */
  pendingOktaRegistration: PendingOktaRegistration | null;
  completeOktaRegistration: (organizationName: string) => Promise<void>;
  cancelOktaRegistration: () => void;
  updateProfile: (data: { name: string; email: string }) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('swfs_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [pendingOktaRegistration, setPendingOktaRegistration] = useState<PendingOktaRegistration | null>(null);

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

  // Handle SSO callback token — or, for a first-time Okta identity, the
  // "please pick your organization" handoff — in the URL.
  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return;
    const params = new URLSearchParams(window.location.search);

    const callbackToken = params.get('token');
    if (callbackToken) {
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
      return;
    }

    if (params.get('register') === '1') {
      const pendingToken = params.get('pendingToken') || '';
      const email = params.get('email') || '';
      const name = params.get('name') || '';
      window.history.replaceState({}, '', '/login');
      setPendingOktaRegistration({ pendingToken, email, name });
      setIsLoading(false);
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

  const completeOktaRegistration = async (organizationName: string) => {
    if (!pendingOktaRegistration) return;
    const result = await authApi.completeOktaRegistration(pendingOktaRegistration.pendingToken, organizationName);
    localStorage.setItem('swfs_token', result.token);
    setToken(result.token);
    setUser(result.user);
    setJustSignedIn(true);
    setPendingOktaRegistration(null);
  };

  const cancelOktaRegistration = () => setPendingOktaRegistration(null);

  const updateProfile = async (data: { name: string; email: string }) => {
    const updated = await authApi.updateProfile(data);
    setUser(updated);
  };

  const uploadAvatar = async (file: File) => {
    const updated = await authApi.uploadAvatar(file);
    setUser(updated);
  };

  const removeAvatar = async () => {
    const updated = await authApi.removeAvatar();
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        justSignedIn,
        dismissJustSignedIn,
        pendingOktaRegistration,
        completeOktaRegistration,
        cancelOktaRegistration,
        updateProfile,
        uploadAvatar,
        removeAvatar,
      }}
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
