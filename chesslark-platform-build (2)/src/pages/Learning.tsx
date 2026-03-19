import type { ThemeMode } from '../App';
import type { RouteKey } from './routes';

const MODULES = [
  { title: 'Tactical Vision', detail: 'Daily puzzles and motif training.' },
  { title: 'Endgame Mastery', detail: 'Fundamental endgames with clear plans.' },
  { title: 'Middlegame Strategy', detail: 'Plans, structures, and piece coordination.' },
];

type LearningProps = {
  onNavigate: (route: RouteKey) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export default function Learning({ onNavigate, theme, onToggleTheme }: LearningProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.35em] text-[color:var(--accent)]">CHESSLARK</div>
            <h1 className="mt-2 text-2xl font-semibold">General Learning</h1>
            <p className="mt-2 max-w-xl text-sm text-[color:var(--muted)]">
              Structured learning modules to level up every phase of your game.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/50"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
            >
              Back to Home
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {MODULES.map((module) => (
            <div key={module.title} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
              <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">MODULE</div>
              <div className="mt-2 text-lg font-semibold">{module.title}</div>
              <p className="mt-2 text-sm text-[color:var(--muted)]">{module.detail}</p>
              <button className="mt-4 rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40">
                Start Session
              </button>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
          <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">INSIGHT</div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Learning analytics and personalized training plans are on the roadmap to help you track
            progress and stay consistent.
          </p>
        </section>
      </div>
    </div>
  );
}
