import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemberSearch } from '../../src/components/MemberSearch.js';

const respond = (url: string) => {
  if (url.includes('/api/admin/users')) {
    return new Response(JSON.stringify({
      items: [{ id: 'u1', nickname: 'Alice', displayName: 'A-LINE', pictureUrl: null, lineUserId: 'U_a', entertainmentMemberCode: 'EM_AA', accountType: 'verified', points: 1, lifetimeDrawCount: 0, blacklistedAt: null, createdAt: '2026-06-01' }],
      nextCursor: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({
    items: [{ id: 'r1', code: 'AAAA1111-1111-1111', tier: 'single', status: 'pending', createdAt: '2026-06-01', statusChangedAt: null, isTest: false, totalWinAmount: 0, user: { id: 'u1', nickname: 'Alice', displayName: 'A' } }],
    nextCursor: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(respond(url))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('MemberSearch', () => {
  it('shows users and redemptions after debounce', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><MemberSearch /></MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Alice' } });
    vi.advanceTimersByTime(260);
    await waitFor(() => expect(screen.getByText(/Alice/)).toBeDefined());
    expect(screen.getByText(/AAAA1111/)).toBeDefined();
  });
});
