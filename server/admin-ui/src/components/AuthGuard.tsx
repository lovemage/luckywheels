import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { fetchAdminMe } from '../api/me.js';

export function AuthGuard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: fetchAdminMe,
    retry: false,
  });
  if (isLoading) return <p>載入中…</p>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
