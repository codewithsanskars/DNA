import { useEffect, useState } from 'react';
import api from '../api/axios';
import AppLayout from '../components/layout/AppLayout';
import Button from '../components/shared/Button';
import Icon from '../components/shared/Icon';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../utils/errors';

type State = { kind: 'working' } | { kind: 'done' } | { kind: 'no-extension' } | { kind: 'error'; message: string };

/**
 * /extension/connect — opened by the "SWFS Sourcer" Chrome extension. Mints a
 * 30-day extension token and hands it to the extension's bridge content
 * script via window.postMessage (same-origin only). The token never appears
 * in the URL.
 */
export default function ExtensionConnectPage() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: 'working' });

  const connect = async () => {
    setState({ kind: 'working' });
    try {
      const res = await api.post('/auth/extension-token');
      const { token, expiresInDays } = res.data.data;
      let acked = false;
      const onAck = (e: MessageEvent) => {
        if (e.source === window && e.origin === window.location.origin && e.data?.type === 'SWFS_EXTENSION_CONNECTED') {
          acked = true;
          window.removeEventListener('message', onAck);
          setState({ kind: 'done' });
        }
      };
      window.addEventListener('message', onAck);
      window.postMessage(
        {
          type: 'SWFS_EXTENSION_CONNECT',
          token,
          expiresAt: Date.now() + expiresInDays * 86400000,
          user: { name: user?.name, email: user?.email },
          portalOrigin: window.location.origin,
        },
        window.location.origin
      );
      setTimeout(() => {
        if (!acked) {
          window.removeEventListener('message', onAck);
          setState({ kind: 'no-extension' });
        }
      }, 2500);
    } catch (err) {
      setState({ kind: 'error', message: errorMessage(err, 'Couldn’t create a connection token.') });
    }
  };

  useEffect(() => {
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppLayout title="Chrome extension" subtitle="SWFS Sourcer">
      <div className="mx-auto mt-6 max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-xs">
        {state.kind === 'working' && (
          <>
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="mt-4 text-sm text-muted-foreground">Connecting the extension…</p>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Icon name="check" size={24} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">Extension connected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {user?.email}. You can close this tab and go back to LinkedIn. The connection lasts 30 days.
            </p>
            <Button className="mt-5" variant="secondary" onClick={() => window.close()}>
              Close tab
            </Button>
          </>
        )}
        {state.kind === 'no-extension' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Icon name="alert" size={24} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">Extension not detected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Install SWFS Sourcer, then open it and click <span className="font-medium text-foreground">Connect to SWFS</span>. If you set a custom portal URL,
              make sure it matches this site ({window.location.origin}).
            </p>
            <Button className="mt-5" variant="primary" onClick={connect}>
              Try again
            </Button>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <h2 className="text-base font-semibold text-foreground">Couldn’t connect</h2>
            <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
            <Button className="mt-5" variant="primary" onClick={connect}>
              Try again
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
