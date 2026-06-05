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
            </Route>
          </Route>
        </Routes>
        <SessionExpiredModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
