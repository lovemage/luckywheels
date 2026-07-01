import { BrowserRouter, Routes, Route, Outlet } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { setSessionExpiredListener } from './api/client.js';
import { fetchAdminMe, type AdminNavKey } from './api/me.js';
import { sessionStore } from './state/session.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { SessionExpiredModal } from './components/SessionExpiredModal.js';
import { Login } from './routes/Login.js';
import { Dashboard } from './routes/Dashboard.js';
import { Members } from './routes/Members.js';
import { MemberDetail } from './routes/MemberDetail.js';
import { Redemptions } from './routes/Redemptions.js';
import { RedemptionDetail } from './routes/RedemptionDetail.js';
import { Profile } from './routes/Profile.js';
import { Logs } from './routes/Logs.js';
import { Prizes } from './routes/Prizes.js';
import { Settings } from './routes/Settings.js';
import { HomeSettings } from './routes/HomeSettings.js';
import { SystemSettings } from './routes/SystemSettings.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function GlobalSessionWire() {
  useEffect(() => {
    setSessionExpiredListener(() => sessionStore.getState().setExpired());
  }, []);
  return null;
}

function AdminNavGate({ nav }: { nav: AdminNavKey }) {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  if (isLoading) return <p>載入中…</p>;
  if (!data?.isMain && !data?.allowedNavs.includes(nav)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <GlobalSessionWire />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route element={<AdminNavGate nav="users" />}>
                <Route path="users" element={<Members />} />
                <Route path="users/:id" element={<MemberDetail />} />
              </Route>
              <Route element={<AdminNavGate nav="redemptions" />}>
                <Route path="redemptions" element={<Redemptions />} />
                <Route path="redemptions/:id" element={<RedemptionDetail />} />
              </Route>
              <Route element={<AdminNavGate nav="prizes" />}>
                <Route path="prizes" element={<Prizes />} />
              </Route>
              <Route element={<AdminNavGate nav="system" />}>
                <Route path="profile" element={<Profile />} />
                <Route path="logs" element={<Logs />} />
                <Route path="settings" element={<Settings />} />
                <Route path="home" element={<HomeSettings />} />
                <Route path="system" element={<SystemSettings />} />
              </Route>
            </Route>
          </Route>
        </Routes>
        <SessionExpiredModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
