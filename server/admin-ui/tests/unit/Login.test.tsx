import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Login } from '../../src/routes/Login.js';

describe('Login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the email + password inputs and a 登入 button', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '登入' })).toBeDefined();
  });

  it('shows a 帳號或密碼錯誤 error on 401', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BAD_CREDENTIALS', message: 'bad' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤');
  });
});
