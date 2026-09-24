import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CreateNoteInput } from '../api/notes';

const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'A title is required.'),
  content: z.string().trim().min(1, 'Content is required.'),
}).strict();

type CreateNoteFormValues = z.output<typeof createNoteSchema>;

type NoteFormProps = {
  isSubmitting: boolean;
  onCreate(input: CreateNoteInput): Promise<boolean>;
};

export function NoteForm({ isSubmitting, onCreate }: NoteFormProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<CreateNoteFormValues>({
    defaultValues: { title: '', content: '' },
    resolver: zodResolver(createNoteSchema),
  });

  async function handleCreate(input: CreateNoteFormValues) {
    const didCreate = await onCreate(input);

    if (didCreate) {
      reset();
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(handleCreate)} noValidate>
      <div className="grid gap-2">
        <label className="font-sans text-sm font-bold" htmlFor="note-title">
          Title
        </label>
        <input
          aria-describedby={errors.title ? 'note-title-error' : undefined}
          aria-invalid={Boolean(errors.title)}
          className="min-h-11 border border-[#9ba9a0] bg-white px-3 font-sans text-base outline-none transition focus:border-[#20302b] focus:ring-2 focus:ring-[#bdd7c3]"
          id="note-title"
          placeholder="e.g. Express error handling"
          {...register('title')}
        />
        {errors.title ? (
          <p className="m-0 font-sans text-sm text-[#a33f32]" id="note-title-error" role="alert">
            {errors.title.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="font-sans text-sm font-bold" htmlFor="note-content">
          Content
        </label>
        <textarea
          aria-describedby={errors.content ? 'note-content-error' : undefined}
          aria-invalid={Boolean(errors.content)}
          className="min-h-36 resize-y border border-[#9ba9a0] bg-white px-3 py-2 font-sans text-base outline-none transition focus:border-[#20302b] focus:ring-2 focus:ring-[#bdd7c3]"
          id="note-content"
          placeholder="Capture an idea, decision, or reference."
          {...register('content')}
        />
        {errors.content ? (
          <p className="m-0 font-sans text-sm text-[#a33f32]" id="note-content-error" role="alert">
            {errors.content.message}
          </p>
        ) : null}
      </div>

      <button
        className="min-h-11 bg-[#20302b] px-4 font-sans text-sm font-bold text-white transition hover:bg-[#395247] disabled:cursor-not-allowed disabled:bg-[#87938d]"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Saving note...' : 'Save note'}
      </button>
    </form>
  );
}