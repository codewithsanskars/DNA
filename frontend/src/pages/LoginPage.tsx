import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth.api';
import Button from '../components/shared/Button';
import { Input } from '../components/shared/Field';
import Icon from '../components/shared/Icon';
import { useThemedLogo } from '../utils/logo';

const DEMO_ACCOUNTS = [
  { label: 'Admin', org: 'All clients', email: 'admin@swfs.ai' },
  { label: 'Client', org: 'TechCorp', email: 'client.client@techcorp.com' },
  { label: 'Client', org: 'FinanceGroup', email: 'client.admin@financegroup.com' },
  { label: 'Client', org: 'Meridian Health', email: 'client.admin@meridianhealth.com' },
];

function oktaErrorMessage(code: string): string {
  switch (code) {
    case 'okta_not_configured':
      return 'Okta SSO isn’t configured yet — use email sign-in below.';
    case 'okta_state_mismatch':
      return 'That sign-in link expired or was already used. Please try again.';
    case 'access_denied':
      return 'Sign-in with Okta was cancelled.';
    default:
      return 'Something went wrong signing in with Okta. Please try again.';
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const swfsLogo = useThemedLogo();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Hide the Okta button rather than sending people through a full redirect
  // round-trip that's just going to bounce straight back as "not configured".
  const { data: oktaStatus } = useQuery({
    queryKey: ['okta-status'],
    queryFn: authApi.getOktaStatus,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    const oktaError = searchParams.get('error');
    if (oktaError) {
      setError(oktaErrorMessage(oktaError));
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async (value: string) => {
    if (!value.trim()) return;
    setError('');
    setIsLoading(true);
    try {
      await login(value.trim());
      navigate('/dashboard');
    } catch {
      setError('Login failed. Please check the address and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doLogin(email);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <img src={swfsLogo} alt="SWFS" className="mx-auto mb-3 h-10 w-auto" />
          <p className="text-[13px] text-muted-foreground">Secure client recruiting portal</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-[15px] font-semibold text-foreground">Sign in</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Enter your work email to continue.</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              required
            />
            {error && <p className="text-xs text-brand-text">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              loading={isLoading}
              className="w-full"
            >
              {isLoading ? 'Signing in…' : 'Continue'}
            </Button>
          </form>

          {oktaStatus?.configured && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-2xs font-medium uppercase tracking-wider text-subtle-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  window.location.href = authApi.getOktaLoginUrl();
                }}
              >
                Continue with Okta SSO
              </Button>
            </>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
            Demo accounts
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                onClick={() => doLogin(acc.email)}
                disabled={isLoading}
                className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">{acc.label}</span>
                  <span className="block truncate text-2xs text-subtle-foreground">
                    {acc.org} · {acc.email}
                  </span>
                </span>
                <Icon
                  name="arrow-right"
                  size={14}
                  className="shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
