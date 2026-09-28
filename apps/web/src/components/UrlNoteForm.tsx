import { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const urlNoteSchema = z.object({
  url: z.url({ protocol: /^https?$/, error: 'Enter an HTTP(S) URL.' }).max(2048),
  instruction: z.string().trim().min(1, 'An instruction is required.').max(2000),
}).strict();

type UrlNoteInput = z.output<typeof urlNoteSchema>;

type UrlNoteFormProps = {
  isSubmitting?: boolean;
  onGenerate?(input: UrlNoteInput): Promise<boolean>;
};

export function UrlNoteForm({ isSubmitting = false, onGenerate }: UrlNoteFormProps) {
  const formId = useId();
  const {
    formState: { errors, isSubmitting: isFormSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<UrlNoteInput>({
    defaultValues: { url: '', instruction: '' },
    resolver: zodResolver(urlNoteSchema),
  });

  async function submit(input: UrlNoteInput) {
    if (onGenerate && await onGenerate(input)) reset();
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid gap-2">
        <label className="font-sans text-sm font-bold" htmlFor={`${formId}-url`}>Page URL</label>
        <input
          aria-describedby={errors.url ? `${formId}-url-error` : undefined}
          aria-invalid={Boolean(errors.url)}
          className="min-h-11 min-w-0 border border-[#9ba9a0] bg-white px-3 font-sans text-base outline-none transition focus:border-[#20302b] focus:ring-2 focus:ring-[#bdd7c3]"
          id={`${formId}-url`}
          type="url"
          placeholder="https://react.dev/learn"
          {...register('url')}
        />
        {errors.url ? (
          <p className="m-0 font-sans text-sm text-[#a33f32]" id={`${formId}-url-error`} role="alert">
            {errors.url.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="font-sans text-sm font-bold" htmlFor={`${formId}-instruction`}>Instruction</label>
        <textarea
          aria-describedby={errors.instruction ? `${formId}-instruction-error` : undefined}
          aria-invalid={Boolean(errors.instruction)}
          className="min-h-36 resize-y border border-[#9ba9a0] bg-white px-3 py-2 font-sans text-base outline-none transition focus:border-[#20302b] focus:ring-2 focus:ring-[#bdd7c3]"
          id={`${formId}-instruction`}
          placeholder="Summarize React best practices."
          {...register('instruction')}
        />
        {errors.instruction ? (
          <p className="m-0 font-sans text-sm text-[#a33f32]" id={`${formId}-instruction-error`} role="alert">
            {errors.instruction.message}
          </p>
        ) : null}
      </div>

      <button
        className="min-h-11 bg-[#20302b] px-4 font-sans text-sm font-bold text-white transition hover:bg-[#395247] disabled:cursor-not-allowed disabled:bg-[#87938d]"
        disabled={isSubmitting || isFormSubmitting || !onGenerate}
        type="submit"
      >
        {isSubmitting || isFormSubmitting ? 'Generating note...' : 'Generate note'}
      </button>
      {!onGenerate ? <p className="m-0 font-sans text-sm text-[#40564b]" role="status">Generation is not available yet.</p> : null}
    </form>
  );
}