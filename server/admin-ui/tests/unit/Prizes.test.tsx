import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Prizes } from '../../src/routes/Prizes.js';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'p1',
              rankLabel: '頭獎',
              name: '萬元現金',
              description: null,
              imageUrl: null,
              cashAmount: 10000,
              weight: 1,
              stock: 1,
              segmentColor: '#d92b3a',
              textColor: '#fff5d6',
              isConsolation: false,
              enabled: true,
              wheelPosition: 0,
              createdAt: '2026-06-01T00:00:00Z',
              updatedAt: '2026-06-01T00:00:00Z',
            },
            {
              id: 'p2',
              rankLabel: '安慰',
              name: '謝謝參加',
              description: null,
              imageUrl: null,
              cashAmount: 0,
              weight: 50,
              stock: 9999,
              segmentColor: '#444',
              textColor: '#fff',
              isConsolation: true,
              enabled: true,
              wheelPosition: 1,
              createdAt: '2026-06-01T00:00:00Z',
              updatedAt: '2026-06-01T00:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
});

describe('Prizes', () => {
  it('renders rows and opens create modal on button click', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Prizes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('頭獎')).toBeDefined();
    expect(screen.getByText('萬元現金')).toBeDefined();
    expect(screen.getByText('安慰')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '新增獎品' }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });
});
