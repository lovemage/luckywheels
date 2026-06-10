import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { fetchSuperadminMe } from '../api/me.js';

export function AuthGuard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['superadmin', 'me'],
    queryFn: fetchSuperadminMe,
    retry: false,
  });
  if (isLoading) return <p className="sa-loading">載入中…</p>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
