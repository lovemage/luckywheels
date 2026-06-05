import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmModal } from '../../src/components/ConfirmModal.js';

describe('ConfirmModal', () => {
  it('disables confirm until reason filled in when requireReason', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        onClose={() => {}}
        title="調整積分"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: '確認' });
    expect(confirmBtn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '客服補償' } });
    expect(confirmBtn).toHaveProperty('disabled', false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('客服補償');
  });
});
