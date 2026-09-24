import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NoteForm } from './NoteForm';

describe('NoteForm', () => {
  it('shows a field error and does not submit empty input', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(true);

    render(<NoteForm isSubmitting={false} onCreate={onCreate} />);

    await user.click(screen.getByRole('button', { name: 'Save note' }));

    expect(await screen.findByText('A title is required.')).toBeInTheDocument();
    expect(await screen.findByText('Content is required.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('submits normalized input and resets after a successful creation', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(true);

    render(<NoteForm isSubmitting={false} onCreate={onCreate} />);

    await user.type(screen.getByLabelText('Title'), '  Architecture  ');
    await user.type(screen.getByLabelText('Content'), '  Keep it simple.  ');
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Architecture',
      content: 'Keep it simple.',
    });
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Content')).toHaveValue('');
  });

  it('disables submission while a note is being created', () => {
    render(<NoteForm isSubmitting onCreate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Saving note...' })).toBeDisabled();
  });
});