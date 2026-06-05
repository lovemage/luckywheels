import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DoubleConfirmModal } from '../../src/components/DoubleConfirmModal.js';

describe('DoubleConfirmModal', () => {
  it('confirm disabled until typed match + reason filled', () => {
    const onConfirm = vi.fn();
    render(
      <DoubleConfirmModal
        open
        onClose={() => {}}
        title="作廢"
        description="不可復原"
        requireReason
        confirmLabel="作廢"
        expectedConfirmText="VOID"
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole('button', { name: '作廢' });
    expect(btn).toHaveProperty('disabled', true);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0]!, { target: { value: '套利' } });
    expect(btn).toHaveProperty('disabled', true);
    fireEvent.change(textboxes[1]!, { target: { value: 'VOID' } });
    expect(btn).toHaveProperty('disabled', false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith('套利');
  });
});
