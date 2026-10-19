export type NoteIndexingJob = {
  noteId: string;
  sourceRevision: string;
  pipelineVersion: string;
};

export type NoteIndexingJobs = {
  enqueue(job: NoteIndexingJob): Promise<void>;
  waitUntilReady(): Promise<void>;
  close(): Promise<void>;
};