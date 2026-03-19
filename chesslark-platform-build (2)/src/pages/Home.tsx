import { motion } from 'framer-motion';
import type { ThemeMode } from '../App';
import type { RouteKey } from './routes';

const NAV_ITEMS: { key: RouteKey; label: string; description: string }[] = [
  { key: 'analysis', label: 'Analysis', description: 'Zero-latency engine analysis and game review.' },
  { key: 'openings', label: 'Opening Learning', description: 'Build repertoire with guided opening lines.' },
  { key: 'learning', label: 'General Learning', description: 'Practice tactics, endgames, and fundamentals.' },
];

type HomeProps = {
  onNavigate: (route: RouteKey) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export default function Home({ onNavigate, theme, onToggleTheme }: HomeProps) {
  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs tracking-[0.35em] text-[color:var(--accent)]">CHESSLARK</div>
            <button
              onClick={onToggleTheme}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/50"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
            Zero‑Latency Chess Analysis.
            <span className="block text-[color:var(--muted)]">Minimal, fast, and built for mastery.</span>
          </h1>
          <p className="max-w-2xl text-sm text-[color:var(--muted)]">
            ChessLark runs Stockfish 18 locally on your device for lightning-fast analysis. Review games,
            learn openings, and sharpen your skills with a clean, distraction-free interface.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('analysis')}
              className="rounded-lg border border-[color:var(--accent)] bg-[color:var(--surface-2)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)] hover:bg-[color:var(--surface-3)]"
            >
              Start Analysis
            </button>
            <button
              onClick={() => onNavigate('openings')}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-5 py-3 text-sm text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
            >
              Explore Openings
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {NAV_ITEMS.map((item, index) => (
            <motion.button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index }}
              className="group rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 text-left transition hover:border-[color:var(--accent)]/40"
            >
              <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">{item.label.toUpperCase()}</div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--text)] group-hover:text-[color:var(--text)]">
                {item.label}
              </div>
              <p className="mt-2 text-sm text-[color:var(--muted)]">{item.description}</p>
            </motion.button>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
            <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">LOCAL ENGINE</div>
            <p className="mt-3 text-sm text-[color:var(--muted)]">
              Stockfish 18 runs fully on-device via Web Workers. No external servers, no latency — just
              instant evaluation as soon as a piece moves.
            </p>
          </div>
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
            <div className="text-xs tracking-[0.2em] text-[color:var(--accent)]">PRO WORKFLOW</div>
            <p className="mt-3 text-sm text-[color:var(--muted)]">
              Import PGNs, review move quality, and visualize evaluations with a focused UX optimized
              for fast analysis and learning.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
