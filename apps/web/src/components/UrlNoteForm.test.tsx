import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UrlNoteForm } from './UrlNoteForm';

describe('UrlNoteForm', () => {
  it('rejects an invalid URL and empty instruction', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(<UrlNoteForm onGenerate={onGenerate} />);

    await user.type(screen.getByLabelText('Page URL'), 'file:///tmp/note');
    await user.click(screen.getByRole('button', { name: 'Generate note' }));

    expect(await screen.findByText('An instruction is required.')).toBeInTheDocument();
    expect(screen.getByText('Enter an HTTP(S) URL.')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('keeps values on failure and resets after success', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<UrlNoteForm onGenerate={onGenerate} />);

    await user.type(screen.getByLabelText('Page URL'), 'https://react.dev/learn');
    await user.type(screen.getByLabelText('Instruction'), 'Summarize React practices');
    await user.click(screen.getByRole('button', { name: 'Generate note' }));

    expect(onGenerate).toHaveBeenCalledWith({
      url: 'https://react.dev/learn', instruction: 'Summarize React practices',
    });
    expect(screen.getByLabelText('Page URL')).toHaveValue('https://react.dev/learn');

    await user.click(screen.getByRole('button', { name: 'Generate note' }));
    expect(screen.getByLabelText('Page URL')).toHaveValue('');
    expect(screen.getByLabelText('Instruction')).toHaveValue('');
  });

  it('blocks duplicate submissions while generation is pending', async () => {
    const user = userEvent.setup();
    let finishGeneration: (saved: boolean) => void = () => {};
    const onGenerate = vi.fn().mockImplementation(() => new Promise<boolean>((resolve) => {
      finishGeneration = resolve;
    }));
    render(<UrlNoteForm onGenerate={onGenerate} />);

    await user.type(screen.getByLabelText('Page URL'), 'https://react.dev/learn');
    await user.type(screen.getByLabelText('Instruction'), 'Summarize React practices');
    await user.click(screen.getByRole('button', { name: 'Generate note' }));

    expect(screen.getByRole('button', { name: 'Generating note...' })).toBeDisabled();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    finishGeneration(false);
    expect(await screen.findByRole('button', { name: 'Generate note' })).toBeEnabled();
  });

  it('does not allow generation without an endpoint', () => {
    render(<UrlNoteForm />);

    expect(screen.getByRole('button', { name: 'Generate note' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Generation is not available yet.');
  });
});