import { useEffect, useState } from 'react';

import { NoteForm } from './NoteForm';
import { UrlNoteForm } from './UrlNoteForm';
import { useNotes } from '../hooks/useNotes';
import type { NoteGenerationJob } from '../api/notes';

const generationStageLabels: Record<NoteGenerationJob['stage'], string> = {
  queued: 'Waiting to start',
  reading_page: 'Reading page',
  summarizing: 'Summarizing page',
  saving_note: 'Saving note',
  completed: 'Completed',
  failed: 'Failed',
};

const generationSteps = ['reading_page', 'summarizing', 'saving_note'] as const;

function completedGenerationSteps(job: NoteGenerationJob) {
  if (job.status === 'completed') return generationSteps;
  const currentStep = generationSteps.findIndex((stage) => stage === job.stage);
  return generationSteps.slice(0, Math.max(currentStep, 0));
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotesApp() {
  const {
    notes,
    generationJobs,
    isLoading,
    isCreating,
    isSubmittingGeneration,
    pendingNoteIds,
    errorMessage,
    create,
    generateFromUrl,
    update,
    remove,
  } = useNotes();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [creationMode, setCreationMode] = useState<'manual' | 'url'>('manual');
  const [activityTime, setActivityTime] = useState(Date.now);
  const visibleJobs = generationJobs.filter((job) => job.status !== 'completed' ||
    !job.finishedAt || Date.parse(job.finishedAt) + 60_000 > Math.max(activityTime, Date.now()));

  useEffect(() => {
    const now = Date.now();
    const expirations = generationJobs
      .flatMap((job) => job.status === 'completed' && job.finishedAt
        ? [Date.parse(job.finishedAt) + 60_000] : [])
      .filter((expiration) => expiration > now);
    if (!expirations.length) return;
    const timer = setTimeout(() => setActivityTime(Date.now()), Math.min(...expirations) - now);
    return () => clearTimeout(timer);
  }, [generationJobs, activityTime]);

  async function handleUpdate(noteId: string, input: { title: string; content: string }) {
    const didUpdate = await update(noteId, input);

    if (didUpdate) {
      setEditingNoteId(null);
    }

    return didUpdate;
  }

  async function handleDelete(noteId: string) {
    const didDelete = await remove(noteId);

    if (didDelete) {
      setConfirmDeleteNoteId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f0e6] text-[#20302b]">
      <header className="border-b border-[#c6cec6] bg-[linear-gradient(135deg,rgba(208,231,214,0.7),transparent_56%)] px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="m-0 font-sans text-xs font-bold tracking-[0.08em] text-[#5b7166] uppercase">
            Personal knowledge base
          </p>
          <h1 className="mt-2 text-5xl font-normal sm:text-6xl">Notes</h1>
          <p className="mb-0 max-w-2xl text-lg leading-relaxed">
            Capture the engineering decisions and ideas you want SAGE to help you revisit.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-10">
        <section aria-labelledby="notes-heading">
          <div className="flex items-baseline justify-between gap-4 border-b border-[#c6cec6] pb-4">
            <h2 className="m-0 text-2xl font-normal" id="notes-heading">
              Your notes
            </h2>
            <span className="font-sans text-sm text-[#5b7166]">{notes.length} total</span>
          </div>

          {errorMessage ? (
            <div className="mt-5 border-l-4 border-[#a33f32] bg-[#f4d8d1] px-4 py-3 font-sans text-sm text-[#702d24]" role="alert">
              <p className="m-0 font-bold">We couldn’t complete that request</p>
              <p className="mb-0 mt-1">{errorMessage}</p>
            </div>
          ) : null}

          {isLoading ? (
            <p className="mt-8 font-sans text-[#5b7166]" aria-live="polite">
              Loading notes...
            </p>
          ) : null}

          {!isLoading && notes.length === 0 ? (
            <p className="mt-8 border-l-4 border-[#5b7166] pl-4 text-lg leading-relaxed">
              No notes yet. Add your first one from the form.
            </p>
          ) : null}

          {!isLoading && notes.length > 0 ? (
            <ol className="mt-6 grid list-none gap-4 p-0">
              {notes.map((note) => (
                <li key={note.id}>
                  <article className="border border-[#c6cec6] bg-white p-5">
                    {editingNoteId === note.id ? (
                      <div>
                        <h3 className="mb-4 mt-0 text-xl font-normal">Edit note</h3>
                        <NoteForm
                          key={note.id}
                          initialValues={{ title: note.title, content: note.content }}
                          isSubmitting={pendingNoteIds.has(note.id)}
                          onSave={(input) => handleUpdate(note.id, input)}
                          submitLabel="Save changes"
                        />
                        <button
                          className="mt-3 min-h-10 border border-[#9ba9a0] px-3 font-sans text-sm font-bold hover:bg-[#edf1eb]"
                          onClick={() => setEditingNoteId(null)}
                          type="button"
                        >
                          Cancel editing
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <h3 className="m-0 text-xl font-normal">{note.title}</h3>
                          <time className="font-sans text-xs text-[#5b7166]" dateTime={note.createdAt}>
                            {formatCreatedAt(note.createdAt)}
                          </time>
                        </div>
                        <p className="mb-0 mt-3 whitespace-pre-wrap font-sans leading-relaxed text-[#34473f]">
                          {note.content}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            className="min-h-10 border border-[#9ba9a0] px-3 font-sans text-sm font-bold hover:bg-[#edf1eb] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={pendingNoteIds.has(note.id)}
                            onClick={() => {
                              setConfirmDeleteNoteId(null);
                              setEditingNoteId(note.id);
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="min-h-10 border border-[#a33f32] px-3 font-sans text-sm font-bold text-[#702d24] hover:bg-[#f4d8d1] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={pendingNoteIds.has(note.id)}
                            onClick={() => {
                              setEditingNoteId(null);
                              setConfirmDeleteNoteId(note.id);
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                        {confirmDeleteNoteId === note.id ? (
                          <div className="mt-4 border-l-4 border-[#a33f32] bg-[#f4d8d1] p-4" role="group" aria-label={`Confirm deletion of ${note.title}`}>
                            <p className="m-0 font-sans text-sm">Delete this note permanently?</p>
                            <div className="mt-3 flex gap-2">
                              <button
                                className="min-h-10 bg-[#702d24] px-3 font-sans text-sm font-bold text-white hover:bg-[#57231c] disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={pendingNoteIds.has(note.id)}
                                onClick={() => void handleDelete(note.id)}
                                type="button"
                              >
                                {pendingNoteIds.has(note.id) ? 'Deleting...' : 'Confirm delete'}
                              </button>
                              <button
                                className="min-h-10 border border-[#9ba9a0] px-3 font-sans text-sm font-bold hover:bg-white"
                                onClick={() => setConfirmDeleteNoteId(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <aside className="self-start border-t-4 border-[#20302b] bg-[#dbe8d9] p-5" aria-labelledby="create-note-heading">
          <h2 className="m-0 text-2xl font-normal" id="create-note-heading">
            New note
          </h2>
          <div
            className="mt-5 flex border-b border-[#9ba9a0]"
            role="tablist"
            aria-label="Note creation method"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const nextMode = creationMode === 'manual' ? 'url' : 'manual';
              setCreationMode(nextMode);
              event.currentTarget.querySelector<HTMLButtonElement>(`#${nextMode}-note-tab`)?.focus();
            }}
          >
            <button
              aria-controls="manual-note-panel"
              aria-selected={creationMode === 'manual'}
              className="min-h-11 flex-1 border-b-2 px-2 font-sans text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#20302b] data-[selected=true]:border-[#20302b] data-[selected=false]:border-transparent"
              data-selected={creationMode === 'manual'}
              id="manual-note-tab"
              onClick={() => setCreationMode('manual')}
              role="tab"
              tabIndex={creationMode === 'manual' ? 0 : -1}
              type="button"
            >
              Manual
            </button>
            <button
              aria-controls="url-note-panel"
              aria-selected={creationMode === 'url'}
              className="min-h-11 flex-1 border-b-2 px-2 font-sans text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#20302b] data-[selected=true]:border-[#20302b] data-[selected=false]:border-transparent"
              data-selected={creationMode === 'url'}
              id="url-note-tab"
              onClick={() => setCreationMode('url')}
              role="tab"
              tabIndex={creationMode === 'url' ? 0 : -1}
              type="button"
            >
              From URL
            </button>
          </div>
          <div className="mt-6" id="manual-note-panel" role="tabpanel" aria-labelledby="manual-note-tab" hidden={creationMode !== 'manual'}>
            <NoteForm isSubmitting={isCreating} onSave={create} />
          </div>
          <div className="mt-6" id="url-note-panel" role="tabpanel" aria-labelledby="url-note-tab" hidden={creationMode !== 'url'}>
            <UrlNoteForm isSubmitting={isSubmittingGeneration} onGenerate={generateFromUrl} />
            {visibleJobs.length > 0 ? (
              <section className="mt-5 border-t border-[#9ba9a0] pt-4" aria-labelledby="generation-heading">
                <h3 className="m-0 text-base font-normal" id="generation-heading">Generation activity</h3>
                <ul className="mb-0 mt-3 grid list-none gap-3 p-0 font-sans text-sm" aria-live="polite">
                  {visibleJobs.map((job) => (
                    <li className="grid min-w-0 gap-1" key={job.id}>
                      <span>{generationStageLabels[job.stage]}</span>
                      <ol className="m-0 list-none space-y-1 p-0 text-xs text-[#40564b]" aria-label="Completed steps">
                        {completedGenerationSteps(job).map((stage) => (
                          <li key={stage}>{generationStageLabels[stage]}: Done</li>
                        ))}
                      </ol>
                      <time className="text-xs text-[#5b7166]" dateTime={job.createdAt}>
                        {formatCreatedAt(job.createdAt)}
                      </time>
                      {job.error ? <span className="break-words text-[#702d24]">{job.error}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}