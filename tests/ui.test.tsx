import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openDB } from 'idb';
import App from '../src/App';
import { resetDb } from '../src/db';

beforeEach(async () => {
  await resetDb();
});

const cardId = (title: string): number => {
  const heading = screen.getByRole('heading', { name: title });
  const article = heading.closest('article') as HTMLElement;
  const id = (article.getAttribute('data-testid') ?? 'session-').replace('session-', '');
  return Number(id);
};

const activeBadges = () => screen.queryAllByText('ACTIVE');

const createSession = async (title: string) => {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('new-session'));
  await user.type(screen.getByLabelText('Title'), title);
  await user.click(screen.getByRole('button', { name: 'Create session' }));
  await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument());
};

const seedLegacySession = async (): Promise<number> => {
  const raw = await openDB('ghosttab', 2, {
    upgrade(dbb) {
      if (!dbb.objectStoreNames.contains('sessions')) {
        const s = dbb.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by-state', 'state');
      }
      if (!dbb.objectStoreNames.contains('meta')) dbb.createObjectStore('meta');
    },
  });
  const id = await raw.add('sessions', {
    title: 'Legacy',
    description: '',
    progress: '',
    blockers: '',
    nextAction: '',
    state: 'PAUSED',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    totalFocusedMs: 777000,
    activeStartedAt: null,
  });
  raw.close();
  return id as number;
};

describe('GhostTab UI', () => {
  it('renders the dashboard header and empty state', async () => {
    render(<App />);
    expect(screen.getByText('GhostTab')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/No sessions yet/)).toBeInTheDocument());
    expect(screen.getByTestId('total-focused').textContent).toBe('00:00:00');
  });

  it('creates a session and shows it as PAUSED', async () => {
    render(<App />);
    await createSession('Write docs');
    expect(screen.getByText('Write docs')).toBeInTheDocument();
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
  });

  it('blocks creating a session without a title', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('new-session'));
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.queryByTestId('session-1')).not.toBeInTheDocument();
  });

  it('activating a session pauses the previous one (single-active across UI)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createSession('Alpha');
    await createSession('Beta');
    const alpha = cardId('Alpha');
    const beta = cardId('Beta');

    await user.click(screen.getByTestId(`activate-${alpha}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(1));
    expect(screen.getByTestId(`session-${alpha}`).textContent).toContain('ACTIVE');

    await user.click(screen.getByTestId(`activate-${beta}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(1));
    expect(screen.getByTestId(`session-${beta}`).textContent).toContain('ACTIVE');
    expect(screen.getByTestId(`session-${alpha}`).textContent).toContain('PAUSED');
  });

  it('resume reactivates a paused session', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createSession('Alpha');
    await createSession('Beta');
    const alpha = cardId('Alpha');

    await user.click(screen.getByTestId(`activate-${alpha}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(1));

    await user.click(screen.getByTestId(`pause-${alpha}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(0));

    await user.click(screen.getByTestId(`resume-${alpha}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(1));
    expect(screen.getByTestId(`session-${alpha}`).textContent).toContain('ACTIVE');
  });

  it('completing a session moves it out of active work', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createSession('Alpha');
    const alpha = cardId('Alpha');

    await user.click(screen.getByTestId(`activate-${alpha}`));
    await waitFor(() => expect(activeBadges()).toHaveLength(1));

    await user.click(screen.getByTestId(`complete-${alpha}`));
    await waitFor(() => expect(screen.getByTestId(`session-${alpha}`).textContent).toContain('COMPLETED'));
    expect(activeBadges()).toHaveLength(0);
  });

  it('shows the analytics panel with metrics after creating sessions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createSession('Alpha');
    await createSession('Beta');

    await user.click(screen.getByTestId('view-analytics'));
    await waitFor(() => expect(screen.getByTestId('analytics-panel')).toBeInTheDocument());

    expect(screen.getByTestId('ov-sessions').textContent).toContain('2');
    expect(screen.getByTestId('ov-paused').textContent).toContain('2');
    expect(screen.getByTestId('activity-chart')).toBeInTheDocument();
    // Range filter control is present and switchable.
    await user.click(screen.getByTestId('range-all'));
    expect(screen.getByTestId('range-all')).toHaveClass('segment-active');
  });

  it('shows an empty state when there are no sessions', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('view-analytics'));
    await waitFor(() => expect(screen.getByTestId('analytics-empty')).toBeInTheDocument());
  });

  it('shows unavailable-data indicators for legacy sessions', async () => {
    await seedLegacySession();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('view-analytics'));

    await waitFor(() => expect(screen.getByTestId('weekly-legacy-note')).toBeInTheDocument());
    expect(screen.getByTestId('coverage-note').textContent).toContain('1 legacy');
  });
});
