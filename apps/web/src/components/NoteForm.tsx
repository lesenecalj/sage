import { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CreateNoteInput } from '../api/notes';

const fieldClassName = 'border border-[#9ba9a0] bg-white px-3 font-sans text-base outline-none transition focus:border-[#20302b] focus:ring-2 focus:ring-[#bdd7c3]';
const fieldErrorClassName = 'm-0 font-sans text-sm text-[#a33f32]';

const noteFormSchema = z.object({
  title: z.string().trim().min(1, 'A title is required.'),
  content: z.string().trim().min(1, 'Content is required.'),
}).strict();

type NoteFormValues = z.output<typeof noteFormSchema>;

type NoteFormProps = {
  isSubmitting: boolean;
  initialValues?: CreateNoteInput;
  submitLabel?: string;
  onSave(input: CreateNoteInput): Promise<boolean>;
};

export function NoteForm({ isSubmitting, initialValues, submitLabel = 'Save note', onSave }: NoteFormProps) {
  const formId = useId();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<NoteFormValues>({
    defaultValues: initialValues ?? { title: '', content: '' },
    resolver: zodResolver(noteFormSchema),
  });

  async function handleCreate(input: NoteFormValues) {
    const didSave = await onSave(input);

    if (didSave && !initialValues) {
      reset();
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(handleCreate)} noValidate>
      <div className="grid gap-2">
          <label className="font-sans text-sm font-bold" htmlFor={`${formId}-note-title`}>
            Title
          </label>
          <input
            aria-describedby={errors.title ? `${formId}-note-title-error` : undefined}
            aria-invalid={Boolean(errors.title)}
            className={`min-h-11 ${fieldClassName}`}
            id={`${formId}-note-title`}
            placeholder="e.g. Express error handling"
            {...register('title')}
          />
          {errors.title ? (
            <p className={fieldErrorClassName} id={`${formId}-note-title-error`} role="alert">
              {errors.title.message}
            </p>
          ) : null}
      </div>

      <div className="grid gap-2">
        <label className="font-sans text-sm font-bold" htmlFor={`${formId}-note-content`}>
          Content
        </label>
        <textarea
          aria-describedby={errors.content ? `${formId}-note-content-error` : undefined}
          aria-invalid={Boolean(errors.content)}
          className={`min-h-36 resize-y py-2 ${fieldClassName}`}
          id={`${formId}-note-content`}
          placeholder="Capture an idea, decision, or reference."
          {...register('content')}
        />
        {errors.content ? (
          <p className={fieldErrorClassName} id={`${formId}-note-content-error`} role="alert">
            {errors.content.message}
          </p>
        ) : null}
      </div>

      <button
        className="min-h-11 bg-[#20302b] px-4 font-sans text-sm font-bold text-white transition hover:bg-[#395247] disabled:cursor-not-allowed disabled:bg-[#87938d]"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Saving note...' : submitLabel}
      </button>
    </form>
  );
}