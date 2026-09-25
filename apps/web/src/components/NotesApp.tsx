import { NoteForm } from './NoteForm';
import { useNotes } from '../hooks/useNotes';

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotesApp() {
  const { notes, isLoading, isCreating, errorMessage, create } = useNotes();

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
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="m-0 text-xl font-normal">{note.title}</h3>
                      <time className="font-sans text-xs text-[#5b7166]" dateTime={note.createdAt}>
                        {formatCreatedAt(note.createdAt)}
                      </time>
                    </div>
                    <p className="mb-0 mt-3 whitespace-pre-wrap font-sans leading-relaxed text-[#34473f]">
                      {note.content}
                    </p>
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
          <p className="mt-2 font-sans text-sm leading-relaxed text-[#40564b]">
            Notes are stored in memory during this MVP.
          </p>
          <div className="mt-6">
            <NoteForm isSubmitting={isCreating} onCreate={create} />
          </div>
        </aside>
      </div>
    </main>
  );
}