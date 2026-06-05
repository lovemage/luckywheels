import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
