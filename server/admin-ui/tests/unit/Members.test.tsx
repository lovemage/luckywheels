import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Members } from '../../src/routes/Members.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({
      items: [
        { id: 'u1', nickname: 'Alice', displayName: 'ALICE', pictureUrl: null, lineUserId: 'U_a',
          entertainmentMemberCode: 'EM_AA', accountType: 'verified', points: 28,
          lifetimeDrawCount: 3, blacklistedAt: null, createdAt: '2026-06-01' },
      ],
      nextCursor: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  ));
});

describe('Members', () => {
  it('renders the row with nickname + account type badge', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Members /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Alice')).toBeDefined();
    expect(screen.getByText('正式')).toBeDefined();
  });

  it('loads the next cursor and can return to the previous page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: 'u1', nickname: 'Alice', displayName: 'ALICE', pictureUrl: null, lineUserId: 'U_a',
            entertainmentMemberCode: 'EM_AA', accountType: 'verified', points: 28,
            lifetimeDrawCount: 3, blacklistedAt: null, createdAt: '2026-06-01' },
        ],
        nextCursor: 'cursor-2',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: 'u2', nickname: 'Bob', displayName: 'BOB', pictureUrl: null, lineUserId: 'U_b',
            entertainmentMemberCode: 'EM_BB', accountType: 'verified', points: 8,
            lifetimeDrawCount: 1, blacklistedAt: null, createdAt: '2026-05-01' },
        ],
        nextCursor: null,
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Members /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Alice')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
    expect(await screen.findByText('Bob')).toBeDefined();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('cursor=cursor-2');
    expect(screen.getByText('第 2 頁')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '上一頁' }));
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByText('第 1 頁')).toBeDefined();
  });
});
