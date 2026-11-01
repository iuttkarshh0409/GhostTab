import { useEffect, useState } from 'react';
import type { Session, SessionInput } from '../types';
import { emptyInput, inputFromSession, validateSession } from '../validation';

interface Props {
  open: boolean;
  session: Session | null; // null => create
  onClose: () => void;
  onSubmit: (input: SessionInput) => Promise<unknown>;
}

export function SessionForm({ open, session, onClose, onSubmit }: Props) {
  const [input, setInput] = useState<SessionInput>(emptyInput());
  const [errors, setErrors] = useState<Partial<Record<keyof SessionInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setInput(session ? inputFromSession(session) : emptyInput());
      setErrors({});
      setSubmitting(false);
    }
  }, [open, session]);

  if (!open) return null;

  const update = (field: keyof SessionInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setInput((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSession(input);
    setErrors(validation.errors);
    if (!validation.ok) return;
    setSubmitting(true);
    try {
      await onSubmit(input);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name: keyof SessionInput, label: string, tag: 'input' | 'textarea' = 'input', placeholder = '') => (
    <label className="field">
      <span className="field-label">{label}</span>
      {tag === 'input' ? (
        <input
          type="text"
          value={input[name]}
          onChange={update(name)}
          placeholder={placeholder}
          className={errors[name] ? 'input error' : 'input'}
        />
      ) : (
        <textarea
          value={input[name]}
          onChange={update(name)}
          placeholder={placeholder}
          rows={tag === 'textarea' ? 3 : 2}
          className={errors[name] ? 'input error' : 'input'}
        />
      )}
      {errors[name] && <span className="field-error">{errors[name]}</span>}
    </label>
  );

  return (
    <div className="overlay" data-testid="session-form-overlay">
      <form className="modal" onSubmit={handleSubmit} data-testid="session-form">
        <h2 className="modal-title">{session ? 'Edit session' : 'New session'}</h2>
        {field('title', 'Title', 'input', 'e.g. Refactor auth module')}
        {field('description', 'Description', 'textarea', 'What is this session about?')}
        {field('progress', 'Progress', 'textarea', 'What has been done so far?')}
        {field('blockers', 'Blockers', 'textarea', 'Anything blocking progress?')}
        {field('nextAction', 'Next action', 'input', 'One concrete next step')}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={submitting}>
            {submitting ? 'Saving…' : session ? 'Save changes' : 'Create session'}
          </button>
        </div>
      </form>
    </div>
  );
}
