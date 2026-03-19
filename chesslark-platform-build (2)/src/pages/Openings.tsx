import type { ThemeMode } from '../App';
import type { RouteKey } from './routes';

const OPENING_SETS = [
  { name: 'Classical Core', focus: 'Ruy Lopez, Italian, Queen’s Gambit' },
  { name: 'Dynamic Attack', focus: 'Sicilian Najdorf, King’s Indian' },
  { name: 'Solid Defense', focus: 'Caro-Kann, Slav, French' },
];

type OpeningsProps = {
  onNavigate: (route: RouteKey) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export default function Openings({ onNavigate, theme, onToggleTheme }: OpeningsProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.35em] text-[color:var(--accent)]">CHESSLARK</div>
            <h1 className="mt-2 text-2xl font-semibold">Opening Learning</h1>
            <p className="mt-2 max-w-xl text-sm text-[color:var(--muted)]">
              Build a clean, focused repertoire. Explore curated opening clusters and drill key ideas.
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
          {OPENING_SETS.map((set) => (
            <div key={set.name} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
              <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">REPERTOIRE</div>
              <div className="mt-2 text-lg font-semibold">{set.name}</div>
              <p className="mt-2 text-sm text-[color:var(--muted)]">{set.focus}</p>
              <button className="mt-4 rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40">
                Start Drill
              </button>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
          <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">COMING NEXT</div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Interactive opening trees, spaced-repetition flashcards, and guided model games are in
            development for a full learning pipeline.
          </p>
        </section>
      </div>
    </div>
  );
}
