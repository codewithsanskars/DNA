import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { isAdminRole } from './utils/roles';
import { ToastProvider } from './components/shared/Toast';
import { ConfirmProvider } from './components/shared/Confirm';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import SearchPage from './pages/SearchPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import MasterDatabasePage from './pages/MasterDatabasePage';
import OrganizationPage from './pages/OrganizationPage';
import OrganizationDetailPage from './pages/OrganizationDetailPage';
import ActivityPage from './pages/ActivityPage';
import SettingsPage from './pages/SettingsPage';
import LoadingSpinner from './components/shared/LoadingSpinner';
import LoginSplash from './components/auth/LoginSplash';
import OktaRegisterModal from './components/auth/OktaRegisterModal';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// Organizations is SWFS-staff-only — a client typing the URL directly gets
// bounced to their dashboard, same as if the route didn't exist.
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return isAdminRole(user.role) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const {
    user,
    justSignedIn,
    dismissJustSignedIn,
    pendingOktaRegistration,
    completeOktaRegistration,
    cancelOktaRegistration,
  } = useAuth();

  return (
    <>
      {justSignedIn && <LoginSplash onDone={dismissJustSignedIn} />}
      {pendingOktaRegistration && (
        <OktaRegisterModal
          email={pendingOktaRegistration.email}
          name={pendingOktaRegistration.name}
          onSubmit={completeOktaRegistration}
          onCancel={cancelOktaRegistration}
        />
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        {/* Okta redirects here with ?token=… — AuthContext exchanges it for the
            logged-in user, and once that lands we're taken into the app. */}
        <Route path="/auth/callback" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/jobs" element={<PrivateRoute><JobsPage /></PrivateRoute>} />
        <Route path="/search" element={<AdminRoute><SearchPage /></AdminRoute>} />
        <Route path="/jobs/:id" element={<PrivateRoute><CandidatesPage /></PrivateRoute>} />
        <Route path="/candidates" element={<PrivateRoute><CandidatesPage /></PrivateRoute>} />
        <Route path="/candidates/:id" element={<PrivateRoute><CandidateDetailPage /></PrivateRoute>} />
        <Route path="/master-database" element={<AdminRoute><MasterDatabasePage /></AdminRoute>} />
        <Route path="/organization" element={<AdminRoute><OrganizationPage /></AdminRoute>} />
        <Route path="/organization/:id" element={<AdminRoute><OrganizationDetailPage /></AdminRoute>} />
        <Route path="/activity" element={<PrivateRoute><ActivityPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
