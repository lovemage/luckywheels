import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setSessionExpiredListener } from './api/client.js';
import { sessionStore } from './state/session.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { SessionExpiredModal } from './components/SessionExpiredModal.js';
import { Login } from './routes/Login.js';
import { Members } from './routes/Members.js';
import { MemberDetail } from './routes/MemberDetail.js';
import { Stats } from './routes/Stats.js';

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
      <BrowserRouter>
        <GlobalSessionWire />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route index element={<Members />} />
              <Route path="stats" element={<Stats />} />
              <Route path="users/:site/:id" element={<MemberDetail />} />
            </Route>
          </Route>
        </Routes>
        <SessionExpiredModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
