import type { SessionInput } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof SessionInput, string>>;
}

export const validateSession = (input: SessionInput): ValidationResult => {
  const errors: ValidationResult['errors'] = {};

  const title = input.title.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > 80) errors.title = 'Title must be 80 characters or fewer.';

  if (input.description.length > 500) errors.description = 'Description must be 500 characters or fewer.';
  if (input.progress.length > 1000) errors.progress = 'Progress must be 1000 characters or fewer.';
  if (input.blockers.length > 1000) errors.blockers = 'Blockers must be 1000 characters or fewer.';
  if (input.nextAction.length > 500) errors.nextAction = 'Next action must be 500 characters or fewer.';

  return { ok: Object.keys(errors).length === 0, errors };
};

export const emptyInput = (): SessionInput => ({
  title: '',
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
});

export const inputFromSession = (s: { title: string; description: string; progress: string; blockers: string; nextAction: string }): SessionInput => ({
  title: s.title,
  description: s.description,
  progress: s.progress,
  blockers: s.blockers,
  nextAction: s.nextAction,
});
