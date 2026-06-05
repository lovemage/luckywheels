import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionExpiredModal } from '../../src/components/SessionExpiredModal.js';
import { sessionStore } from '../../src/state/session.js';

function renderWith(node: React.ReactNode) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SessionExpiredModal', () => {
  it('is hidden by default', () => {
    sessionStore.setState({ expiredVisible: false });
    renderWith(<SessionExpiredModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows when sessionStore.expiredVisible is true', () => {
    sessionStore.setState({ expiredVisible: true });
    renderWith(<SessionExpiredModal />);
    expect(screen.getByText('請先登入')).toBeDefined();
  });
});
