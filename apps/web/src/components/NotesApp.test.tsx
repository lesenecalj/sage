import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NotesApp } from './NotesApp';

const { useNotes } = vi.hoisted(() => ({ useNotes: vi.fn() }));

vi.mock('../hooks/useNotes', () => ({ useNotes }));

describe('NotesApp', () => {
  it('shows a loading state while notes are loading', () => {
    useNotes.mockReturnValue({
      notes: [],
      generationJobs: [],
      isLoading: true,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      generateFromUrl: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByText('Loading notes...')).toBeInTheDocument();
  });

  it('shows an empty state after loading an empty list', () => {
    useNotes.mockReturnValue({
      notes: [],
      generationJobs: [],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      generateFromUrl: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByText('No notes yet. Add your first one from the form.')).toBeInTheDocument();
  });

  it('switches creation modes and submits URL generation', async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    const generateFromUrl = vi.fn().mockResolvedValue(true);
    useNotes.mockReturnValue({
      notes: [], isLoading: false, isCreating: false,
      generationJobs: [],
      pendingNoteIds: new Set(), errorMessage: null,
      create, generateFromUrl, update: vi.fn(), remove: vi.fn(),
    });

    render(<NotesApp />);
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'manual-note-tab');
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Draft note');

    await user.click(screen.getByRole('tab', { name: 'From URL' }));
    expect(screen.getByRole('tab', { name: 'From URL' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Page URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Instruction')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate note' })).toBeEnabled();
    expect(create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Page URL'), 'https://react.dev/learn');
    await user.type(screen.getByLabelText('Instruction'), 'Summarize React practices');
    await user.click(screen.getByRole('button', { name: 'Generate note' }));
    expect(generateFromUrl).toHaveBeenCalledWith({
      url: 'https://react.dev/learn',
      instruction: 'Summarize React practices',
    });

    await user.click(screen.getByRole('tab', { name: 'From URL' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Manual' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Title')).toHaveValue('Draft note');
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
      generationJobs: [],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: 'Unable to save note.',
      create: vi.fn(),
      generateFromUrl: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    expect(screen.getByRole('heading', { name: 'Architecture' })).toBeInTheDocument();
    expect(screen.getByText('Keep it simple.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save note.');
  });

  it('shows restored generation status beneath the URL form', async () => {
    const user = userEvent.setup();
    useNotes.mockReturnValue({
      notes: [],
      generationJobs: [{
        id: 'c5d0af9d-8b5b-4b78-b088-25b4d4cf2610',
        status: 'running',
        stage: 'summarizing',
        noteId: null,
        error: null,
        createdAt: '2026-10-07T12:00:00.000Z',
        finishedAt: null,
      }],
      isLoading: false,
      isCreating: false,
      pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      generateFromUrl: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    render(<NotesApp />);

    await user.click(screen.getByRole('tab', { name: 'From URL' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('button', { name: 'Generate note' })).toBeEnabled();
    expect(within(panel).getByRole('heading', { name: 'Generation activity' })).toBeInTheDocument();
    expect(within(panel).getByText('Summarizing page')).toBeInTheDocument();
    expect(within(panel).getByText('Reading page: Done')).toBeInTheDocument();
  });

  it('hides completed activity after one minute but retains failures', () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-10-09T12:00:00.000Z');
      vi.setSystemTime(now);
      const completedJob = {
        id: 'c5d0af9d-8b5b-4b78-b088-25b4d4cf2610',
        status: 'completed', stage: 'completed', noteId: 'note-1', error: null,
        createdAt: now.toISOString(), finishedAt: now.toISOString(),
      };
      useNotes.mockReturnValue({
        notes: [], isLoading: false, isCreating: false, isSubmittingGeneration: false,
        generationJobs: [completedJob, {
          ...completedJob, id: 'failed-job', status: 'failed', stage: 'failed',
          noteId: null, error: 'The model is unavailable.',
        }],
        pendingNoteIds: new Set(), errorMessage: null,
        create: vi.fn(), generateFromUrl: vi.fn(), update: vi.fn(), remove: vi.fn(),
      });
      const { unmount } = render(<NotesApp />);
      fireEvent.click(screen.getByRole('tab', { name: 'From URL' }));
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Reading page: Done')).toBeInTheDocument();
      expect(screen.getByText('Summarizing page: Done')).toBeInTheDocument();
      expect(screen.getByText('Saving note: Done')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(60_000); });

      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('The model is unavailable.')).toBeInTheDocument();
      unmount();
    } finally {
      vi.useRealTimers();
    }
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
      generationJobs: [],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      generateFromUrl: vi.fn(),
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
      generationJobs: [],
      isLoading: false,
      isCreating: false,
        pendingNoteIds: new Set(),
      errorMessage: null,
      create: vi.fn(),
      generateFromUrl: vi.fn(),
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