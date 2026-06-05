import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ImageUploadInput } from '../../src/components/ImageUploadInput.js';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://x.com/foo.png', key: 'foo.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

describe('ImageUploadInput', () => {
  it('renders upload button when no value', () => {
    render(<ImageUploadInput value={null} onChange={() => {}} />);
    expect(screen.getByText('上傳圖片')).toBeDefined();
  });

  it('calls onChange with returned url after upload', async () => {
    const onChange = vi.fn();
    const { container } = render(<ImageUploadInput value={null} onChange={onChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'foo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://x.com/foo.png'));
  });
});
