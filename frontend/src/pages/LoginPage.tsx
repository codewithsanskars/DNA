import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import swfsLogo from '../assets/SWFS-LOGO.png';

const DEMO_ACCOUNTS = [
  { label: 'Client Admin (TechCorp)', email: 'client.admin@techcorp.com' },
  { label: 'Hiring Manager (TechCorp)', email: 'hiring@techcorp.com' },
  { label: 'Client Admin (FinanceGroup)', email: 'client.admin@financegroup.com' },
  { label: 'SWFS Admin', email: 'admin@swfs.ai' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setIsLoading(true);
    try {
      await login(email.trim());
      navigate('/dashboard');
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSsoLogin = () => {
    window.location.href = '/api/auth/okta/login';
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setError('');
    setIsLoading(true);
    try {
      await login(demoEmail);
      navigate('/dashboard');
    } catch {
      setError('Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <img src={swfsLogo} alt="SWFS" className="mx-auto mb-3 h-12 w-auto" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Secure client recruiting portal</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#222] dark:bg-[#111]">
          <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Sign in</h2>
          <p className="mb-5 text-xs text-gray-500">Enter your email to continue</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-500 transition-colors dark:border-[#333] dark:bg-[#0a0a0a] dark:text-white dark:placeholder-gray-600 dark:focus:border-blue-600"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Continue'}
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="flex-1 border-t border-gray-200 dark:border-[#222]" />
            <span className="text-[10px] text-gray-400 dark:text-gray-600">OR</span>
            <div className="flex-1 border-t border-gray-200 dark:border-[#222]" />
          </div>

          <button
            onClick={handleSsoLogin}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors dark:border-[#333] dark:text-gray-300 dark:hover:border-[#555] dark:hover:text-white"
          >
            Continue with Okta SSO
          </button>
        </div>

        {/* Demo accounts */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-[#222] dark:bg-[#111]">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Demo Accounts
          </p>
          <div className="space-y-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                onClick={() => handleDemoLogin(acc.email)}
                disabled={isLoading}
                className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 dark:border-[#222] dark:hover:border-[#333] dark:hover:bg-[#1a1a1a]"
              >
                <span className="text-xs text-gray-900 dark:text-white">{acc.label}</span>
                <span className="text-[10px] text-gray-500">{acc.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
