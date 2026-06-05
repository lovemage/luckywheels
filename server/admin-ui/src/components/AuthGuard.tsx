import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { api } from '../api/client.js';

interface Me { id: string; email: string; role: string; }

export function AuthGuard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: () => api<Me>('/api/admin/me'),
    retry: false,
  });
  if (isLoading) return <p>載入中…</p>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
