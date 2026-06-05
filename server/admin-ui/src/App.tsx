import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setSessionExpiredListener } from './api/client.js';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function GlobalSessionWire() {
  useEffect(() => {
    setSessionExpiredListener(() => sessionStore.getState().setExpired());
  }, []);
  return null;
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
              <Route path="users" element={<Members />} />
              <Route path="users/:id" element={<MemberDetail />} />
              <Route path="redemptions" element={<Redemptions />} />
              <Route path="redemptions/:id" element={<RedemptionDetail />} />
              <Route path="profile" element={<Profile />} />
              <Route path="logs" element={<Logs />} />
              <Route path="prizes" element={<Prizes />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
        <SessionExpiredModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
