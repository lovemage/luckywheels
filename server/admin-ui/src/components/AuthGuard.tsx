import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { fetchAdminMe } from '../api/me.js';
import { PageSkeleton } from './Skeleton.js';

export function AuthGuard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: fetchAdminMe,
    retry: false,
  });
  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
