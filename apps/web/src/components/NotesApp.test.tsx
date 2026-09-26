import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NotesApp } from './NotesApp';

const { useNotes } = vi.hoisted(() => ({ useNotes: vi.fn() }));

vi.mock('../hooks/useNotes', () => ({ useNotes }));

describe('NotesApp', () => {
  it('shows a loading state while notes are loading', () => {
    useNotes.mockReturnValue({
      notes: [],
      isLoading: true,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByText('Loading notes...')).toBeInTheDocument();
  });

  it('shows an empty state after loading an empty list', () => {
    useNotes.mockReturnValue({
      notes: [],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByText('No notes yet. Add your first one from the form.')).toBeInTheDocument();
  });

  it('shows notes and an API error', () => {
    useNotes.mockReturnValue({
      notes: [
        {
          id: 'note-1',
          title: 'Architecture',
          content: 'Keep it simple.',
          createdAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: 'Unable to save note.',
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getByText('Keep it simple.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save note.');
  });

  it('submits edits for an existing note', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockResolvedValue(true);
    const note = {
      id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
      title: 'Architecture',
      content: 'Keep it simple.',
      createdAt: '2026-09-24T12:00:00.000Z',
    };
    useNotes.mockReturnValue({
      notes: [note],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      update,
      remove: vi.fn(),
    });

    render(<NotesApp />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const article = screen.getByRole('article');
    const titleInput = within(article).getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated architecture');
    await user.click(within(article).getByRole('button', { name: 'Save changes' }));

    expect(update).toHaveBeenCalledWith(note.id, {
      title: 'Updated architecture',
      content: 'Keep it simple.',
    });
  });

  it('requires confirmation before deleting a note', async () => {
    const user = userEvent.setup();
    const remove = vi.fn().mockResolvedValue(true);
    useNotes.mockReturnValue({
      notes: [
        {
          id: '7d5b9456-eb94-414f-a129-da4aa1bb2c45',
          title: 'Architecture',
          content: 'Keep it simple.',
          createdAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      update: vi.fn(),
      remove,
    });

    render(<NotesApp />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const confirmation = screen.getByRole('group', { name: 'Confirm deletion of Architecture' });
    expect(confirmation).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(confirmation).getByRole('button', { name: 'Confirm delete' }));

    expect(remove).toHaveBeenCalledWith('7d5b9456-eb94-414f-a129-da4aa1bb2c45');
  });
});