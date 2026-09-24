import { render, screen } from '@testing-library/react';
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
      errorMessage: null,
      create: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByText('Loading notes...')).toBeInTheDocument();
  });

  it('shows an empty state after loading an empty list', () => {
    useNotes.mockReturnValue({
      notes: [],
      isLoading: false,
      isCreating: false,
      errorMessage: null,
      create: vi.fn(),
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
      errorMessage: 'Unable to save note.',
      create: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getByText('Keep it simple.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save note.');
  });
});