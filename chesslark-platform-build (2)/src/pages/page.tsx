import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { motion } from 'framer-motion';
import useEngine from '../hooks/useEngine';
import type { ThemeMode } from '../App';
import type { RouteKey } from './routes';

type MoveTagKey = 'best' | 'book' | 'brilliant' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

type MoveRow = {
  ply: number;
  san: string;
  tag?: MoveTagKey;
};

type PendingEval = {
  index: number;
  moveColor: 'w' | 'b';
  evalBefore: number;
  ply: number;
  bestUci: string | null;
  moveUci: string;
};

type ChessComGame = {
  id: string;
  white: string;
  black: string;
  pgn: string;
  endTime?: number;
  timeClass?: string;
};

type BoardTheme = {
  name: string;
  light: string;
  dark: string;
  border: string;
  bg: string;
  preview: string;
};

type AnalysisPageProps = {
  onNavigate: (route: RouteKey) => void;
  activeRoute: RouteKey;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

const MOVE_TAGS: Record<MoveTagKey, { label: string; color: string; bg: string; icon: string }> = {
  best: { label: 'Best', color: 'text-emerald-300', bg: 'bg-emerald-500/10', icon: '✔︎' },
  brilliant: { label: 'Brilliant', color: 'text-blue-300', bg: 'bg-blue-500/10', icon: '✨' },
  great: { label: 'Great', color: 'text-cyan-300', bg: 'bg-cyan-500/10', icon: '★' },
  book: { label: 'Book', color: 'text-sky-300', bg: 'bg-sky-500/10', icon: '📘' },
  good: { label: 'Good', color: 'text-green-300', bg: 'bg-green-500/10', icon: '▲' },
  inaccuracy: { label: 'Inaccuracy', color: 'text-yellow-300', bg: 'bg-yellow-500/10', icon: '≈' },
  mistake: { label: 'Mistake', color: 'text-orange-300', bg: 'bg-orange-500/10', icon: '!' },
  blunder: { label: 'Blunder', color: 'text-red-300', bg: 'bg-red-500/10', icon: '✖︎' },
};

const BOARD_THEMES: BoardTheme[] = [
  {
    name: 'Classic Dark',
    light: '#2a2a2a',
    dark: '#151515',
    border: '#262626',
    bg: '#080808',
    preview: '⚫',
  },
  {
    name: 'White & Brown',
    light: '#F0D9B5',
    dark: '#B58863',
    border: '#8B5A2B',
    bg: '#E8D5B7',
    preview: '🤎',
  },
  {
    name: 'White & Green',
    light: '#EEF2E6',
    dark: '#7AA874',
    border: '#3D8361',
    bg: '#D6CDA4',
    preview: '💚',
  },
  {
    name: 'White & Blue',
    light: '#E8F4F8',
    dark: '#5B8FB9',
    border: '#301E67',
    bg: '#B6EADA',
    preview: '💙',
  },
  {
    name: 'White & Yellow',
    light: '#FFE6B7',
    dark: '#E8B86D',
    border: '#C68432',
    bg: '#FFF3CD',
    preview: '💛',
  },
  {
    name: 'Royal Gold',
    light: '#FFF8DC',
    dark: '#D4AF37',
    border: '#B8860B',
    bg: '#F5DEB3',
    preview: '👑',
  },
  {
    name: 'Ocean Deep',
    light: '#A8D8EA',
    dark: '#306998',
    border: '#1E3A5F',
    bg: '#E3F4FC',
    preview: '🌊',
  },
  {
    name: 'Forest Night',
    light: '#9DC08B',
    dark: '#40513B',
    border: '#2D4323',
    bg: '#EDF1D6',
    preview: '🌲',
  },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function uciToHuman(uci: string | null) {
  if (!uci) return '—';
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.slice(4);
  return promo ? `${from}→${to}=${promo.toUpperCase()}` : `${from}→${to}`;
}

// Removed unused evalToBarPercent function

function classifyMove(improvement: number, ply: number, isBest: boolean): MoveTagKey {
  if (ply <= 10) return 'book';
  if (isBest) return 'best';
  if (improvement >= 150) return 'brilliant';
  if (improvement >= 70) return 'great';
  if (improvement >= 20) return 'good';
  if (improvement >= -35) return 'inaccuracy';
  if (improvement >= -120) return 'mistake';
  return 'blunder';
}

function getKingSquare(game: Chess, color: 'w' | 'b') {
  const board = game.board();
  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (piece && piece.type === 'k' && piece.color === color) {
        const fileChar = String.fromCharCode('a'.charCodeAt(0) + file);
        const rankChar = `${8 - rank}`;
        return `${fileChar}${rankChar}`;
      }
    }
  }
  return null;
}

/**
 * Normalize PGN text: remove BOM, normalize line endings, trim whitespace
 */
function normalizePgn(text: string): string {
  return text
    .replace(/^\uFEFF/, '')           // Remove BOM
    .replace(/\r\n/g, '\n')           // Normalize CRLF to LF
    .replace(/\r/g, '\n')             // Normalize CR to LF
    .trim();
}

/**
 * Clean Chess.com specific formatting from PGN movetext
 * Removes clock annotations, eval comments, timestamps, NAGs, etc.
 * Example Chess.com format:
 * 1. e4 {[%clk 0:03:00]} 1... g6 {[%clk 0:03:00]} 2. d4 ...
 */
function cleanChessComPgn(pgn: string): string {
  let cleaned = pgn;
  
  // Remove all curly brace comments (Chess.com annotations)
  // This handles {[%clk 0:09:58.9]}, {[%eval 0.17]}, {[%timestamp ...]}, etc.
  // Non-greedy match to handle nested/multiple braces properly
  cleaned = cleaned.replace(/\{[^{}]*\}/g, '');
  
  // Run again in case of any remaining braces (nested scenarios)
  cleaned = cleaned.replace(/\{[^{}]*\}/g, '');
  
  // Remove NAGs (Numeric Annotation Glyphs) like $1, $2, etc.
  cleaned = cleaned.replace(/\$\d+/g, '');
  
  // Remove variation lines in parentheses (simplified - doesn't handle nested)
  cleaned = cleaned.replace(/\([^()]*\)/g, '');
  
  // Remove semicolon comments (rest of line)
  cleaned = cleaned.replace(/;[^\n]*/g, '');
  
  // Remove percentage-based annotations that might leak through
  cleaned = cleaned.replace(/\[%[^\]]*\]/g, '');
  
  // Clean up multiple spaces and newlines
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned.trim();
}

/**
 * Extract just the moves from a PGN string (after headers)
 * Handles various PGN formats including Chess.com's format
 */
function extractMovesFromPgn(pgn: string): string {
  // First, clean the PGN
  let cleaned = cleanChessComPgn(pgn);
  
  // Method 1: Try to find moves after headers (standard PGN format)
  const lines = cleaned.split('\n');
  let movesStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Headers start with [ and end with ]
    if (line.startsWith('[') && line.endsWith(']')) {
      movesStartIndex = i + 1;
    } else if (line.match(/^\d+\./)) {
      // Found a move line (starts with move number like "1.")
      movesStartIndex = i;
      break;
    } else if (line === '' && movesStartIndex >= 0) {
      // Empty line after headers
      continue;
    } else if (line && !line.startsWith('[') && movesStartIndex >= 0) {
      // Non-empty, non-header line after we've seen headers
      movesStartIndex = i;
      break;
    }
  }
  
  if (movesStartIndex >= 0) {
    const movesText = lines.slice(movesStartIndex).join(' ');
    return movesText.trim();
  }
  
  // Method 2: Use regex to extract everything after the last header
  const headerPattern = /\[[^\]]+\]/g;
  const withoutHeaders = cleaned.replace(headerPattern, '').trim();
  
  // Method 3: Find the first move number and take everything from there
  const moveStartMatch = withoutHeaders.match(/\d+\.\s*[A-Za-z]/);
  if (moveStartMatch && moveStartMatch.index !== undefined) {
    return withoutHeaders.slice(moveStartMatch.index).trim();
  }
  
  return withoutHeaders;
}

/**
 * Try multiple strategies to load PGN into a Chess.js game
 */
function loadPgnIntoGame(game: Chess, pgn: string): boolean {
  // Strategy 1: Try direct load with sloppy mode
  try {
    game.loadPgn(pgn, { sloppy: true } as any);
    if (game.history().length > 0) {
      return true;
    }
  } catch (e) {
    // Continue to next strategy
  }
  
  // Strategy 2: Clean Chess.com annotations and try again
  try {
    const cleanedPgn = cleanChessComPgn(pgn);
    game.reset();
    game.loadPgn(cleanedPgn, { sloppy: true } as any);
    if (game.history().length > 0) {
      return true;
    }
  } catch (e) {
    // Continue to next strategy
  }
  
  // Strategy 3: Extract just moves and parse manually
  try {
    game.reset();
    const movesText = extractMovesFromPgn(pgn);
    
    // Remove move numbers and result, clean thoroughly
    let cleanMoves = movesText
      .replace(/\d+\.+\s*/g, '')             // Remove move numbers like "1." or "1..." 
      .replace(/1-0|0-1|1\/2-1\/2|\*/g, '')  // Remove results
      .replace(/\+/g, '')                     // Remove check indicators (we recalculate)
      .replace(/#/g, '')                      // Remove mate indicators
      .replace(/[!?]+/g, '')                  // Remove annotation symbols
      .trim();
    
    const moves = cleanMoves.split(/\s+/).filter(m => {
      // Filter out empty strings and invalid tokens
      if (m.length === 0) return false;
      if (m === '...') return false;
      // Basic validation: moves should contain letters
      return /[a-zA-Z]/.test(m);
    });
    
    console.log('Manual parsing: extracted', moves.length, 'moves');
    console.log('First 10 moves:', moves.slice(0, 10));
    
    for (const move of moves) {
      try {
        const result = game.move(move, { sloppy: true } as any);
        if (!result) {
          // Try without sloppy mode
          try {
            const result2 = game.move(move);
            if (!result2) {
              console.warn('Failed to parse move:', move, 'at position', game.fen());
              // Don't break - try to continue with remaining moves
              continue;
            }
          } catch {
            console.warn('Move rejected:', move);
            continue;
          }
        }
      } catch (e) {
        console.warn('Error parsing move:', move, e);
        // Don't break - try to continue
        continue;
      }
    }
    
    if (game.history().length > 0) {
      console.log('Manual parsing successful:', game.history().length, 'moves loaded');
      return true;
    }
  } catch (e) {
    console.error('Manual move parsing failed:', e);
  }
  
  // Strategy 4: Try with completely fresh PGN reconstruction
  try {
    game.reset();
    // Get just the moves portion and rebuild a minimal PGN
    const movesOnly = extractMovesFromPgn(pgn);
    const minimalPgn = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${movesOnly}`;
    
    game.loadPgn(minimalPgn, { sloppy: true } as any);
    if (game.history().length > 0) {
      console.log('Strategy 4 (minimal PGN) successful:', game.history().length, 'moves');
      return true;
    }
  } catch (e) {
    console.error('Minimal PGN strategy failed:', e);
  }
  
  return false;
}

/**
 * Split multiple games and return the first one
 */
function splitFirstGame(pgn: string): string {
  // Try to split by [Event tag which starts each game
  const chunks = pgn.split(/(?=\[Event\s+")/i).filter(Boolean);
  return chunks.length > 0 ? chunks[0].trim() : pgn.trim();
}

// Removed unused formatLineEval function

export default function Page({ onNavigate, activeRoute, theme, onToggleTheme }: AnalysisPageProps) {
  const gameRef = useRef(new Chess());
  const audioRef = useRef<AudioContext | null>(null);

  const [fen, setFen] = useState(gameRef.current.fen());
  const [moveHistory, setMoveHistory] = useState<MoveRow[]>([]);
  const [movesUci, setMovesUci] = useState<string[]>([]);
  const [viewPly, setViewPly] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [activeTheme, setActiveTheme] = useState<number>(1);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalSquareStyles, setLegalSquareStyles] = useState<Record<string, React.CSSProperties>>({});
  const [checkState, setCheckState] = useState({ check: false, mate: false });
  const [pendingEval, setPendingEval] = useState<PendingEval | null>(null);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [pgnText, setPgnText] = useState('');
  const [chessComUser, setChessComUser] = useState('');
  const [chessComGames, setChessComGames] = useState<ChessComGame[]>([]);
  const [chessComLoading, setChessComLoading] = useState(false);
  const [chessComError, setChessComError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const currentTheme = BOARD_THEMES[activeTheme];

  const viewGame = useMemo(() => new Chess(fen), [fen]);

  const engine = useEngine();

  // Analyze when engine becomes ready
  useEffect(() => {
    if (engine.ready) {
      engine.analyze(fen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.ready]);

  const playTone = useCallback((frequency: number, duration = 0.08) => {
    if (!soundEnabled) return;
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.06;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.stop(context.currentTime + duration);
    } catch {
      // ignore sound errors
    }
  }, [soundEnabled]);

  const evaluationBarPercent = useMemo(
    () => {
      // Clamp evaluation between -10 and +10 for display
      const clampedEval = Math.max(-10, Math.min(10, engine.evaluation));
      // Convert to percentage (50% = equal, 100% = white winning, 0% = black winning)
      return 50 + (clampedEval * 5);
    },
    [engine.evaluation]
  );

  useEffect(() => {
    if (!pendingEval) return;
    if (engine.evaluation === 0) return;

    const evalAfter = engine.evaluation;
    const improvement =
      pendingEval.moveColor === 'w'
        ? evalAfter - pendingEval.evalBefore
        : pendingEval.evalBefore - evalAfter;

    const isBest = Boolean(pendingEval.bestUci && pendingEval.bestUci === pendingEval.moveUci);
    const tag = classifyMove(improvement, pendingEval.ply, isBest);
    setMoveHistory((history) =>
      history.map((move, index) => (index === pendingEval.index ? { ...move, tag } : move))
    );
    setPendingEval(null);
  }, [engine.evaluation, pendingEval]);

  const updateStatus = (game: Chess) => {
    setCheckState({ check: game.inCheck(), mate: game.isCheckmate() });
  };

  const buildHistory = (game: Chess, existing?: MoveRow[]) =>
    game.history({ verbose: true }).map((move: any, idx: number) => ({
      ply: idx + 1,
      san: move.san,
      tag: existing?.[idx]?.tag,
    }));

  const getMovesUci = (game: Chess) =>
    game.history({ verbose: true }).map((move: any) => `${move.from}${move.to}${move.promotion ?? ''}`);

  const rebuildGameToPly = (ply: number, uciMoves: string[]) => {
    const g = new Chess();
    uciMoves.slice(0, ply).forEach((uci) => {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.slice(4) || undefined;
      g.move({ from, to, promotion: promo as any });
    });
    return g;
  };

  const applyGameState = (game: Chess, preserveTags = false) => {
    const history = buildHistory(game, preserveTags ? moveHistory : undefined);
    const uci = getMovesUci(game);
    setFen(game.fen());
    setMoveHistory(history);
    setMovesUci(uci);
    setViewPly(history.length);
    updateStatus(game);
    engine.analyze(game.fen());
  };

  const setViewPosition = (ply: number) => {
    const clamped = clamp(ply, 0, movesUci.length);
    const g = rebuildGameToPly(clamped, movesUci);
    setFen(g.fen());
    setViewPly(clamped);
    updateStatus(g);
    engine.analyze(g.fen());
    setSelectedSquare(null);
    setLegalSquareStyles({});
  };

  const makeMove = (from: string, to: string) => {
    const baseGame = viewPly < movesUci.length ? rebuildGameToPly(viewPly, movesUci) : gameRef.current;

    try {
      const move = baseGame.move({ from, to, promotion: 'q' });
      if (!move) return false;

      gameRef.current = baseGame;
      const history = buildHistory(baseGame, moveHistory.slice(0, viewPly));
      const uci = getMovesUci(baseGame);

      setFen(baseGame.fen());
      setMoveHistory(history);
      setMovesUci(uci);
      setViewPly(history.length);
      updateStatus(baseGame);

      const evalBefore = engine.evaluation;
      const moveUci = `${move.from}${move.to}${move.promotion ?? ''}`;

      setPendingEval({
        index: history.length - 1,
        moveColor: move.color,
        evalBefore,
        ply: history.length,
        bestUci: engine.bestMove,
        moveUci,
      });

      engine.analyze(baseGame.fen());

      playTone(520);
      if (baseGame.isCheckmate()) playTone(220, 0.18);
      else if (baseGame.inCheck()) playTone(740, 0.12);

      return true;
    } catch {
      return false;
    }
  };

  const highlightMoves = (square: string) => {
    const game = viewGame;
    const moves = game.moves({ square: square as Square, verbose: true }) as Array<{
      to: Square;
      captured?: string;
    }>;
    if (moves.length === 0) {
      setSelectedSquare(null);
      setLegalSquareStyles({});
      return;
    }

    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: 'rgba(212, 175, 55, 0.35)' },
    };

    moves.forEach((move) => {
      styles[move.to] = {
        background: move.captured
          ? 'radial-gradient(circle, rgba(239, 68, 68, 0.45) 48%, transparent 52%)'
          : 'radial-gradient(circle, rgba(212, 175, 55, 0.6) 28%, transparent 32%)',
      };
    });

    setSelectedSquare(square);
    setLegalSquareStyles(styles);
  };

  const onSquareClick = ({ square }: { square: string }) => {
    if (selectedSquare) {
      const moved = makeMove(selectedSquare, square);
      if (moved) {
        setSelectedSquare(null);
        setLegalSquareStyles({});
        return;
      }
    }

    const game = viewGame;
    const piece = game.get(square as Square);
    if (piece && piece.color === game.turn()) {
      highlightMoves(square);
    } else {
      setSelectedSquare(null);
      setLegalSquareStyles({});
    }
  };

  const onDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare) return false;
    const moved = makeMove(sourceSquare, targetSquare);
    if (moved) {
      setSelectedSquare(null);
      setLegalSquareStyles({});
    }
    return moved;
  };

  const reset = () => {
    gameRef.current.reset();
    setSelectedSquare(null);
    setLegalSquareStyles({});
    setPendingEval(null);
    setPgnError(null);
    applyGameState(gameRef.current);
  };

  const undo = () => {
    const g = gameRef.current;
    g.undo();
    setSelectedSquare(null);
    setLegalSquareStyles({});
    setPendingEval(null);
    applyGameState(g, true);
  };

  const loadPgnText = (pgn: string) => {
    const normalized = normalizePgn(pgn);
    if (!normalized) {
      setPgnError('PGN is empty.');
      return;
    }

    // Debug: log the raw PGN for troubleshooting
    console.log('Loading PGN, length:', normalized.length);
    console.log('PGN preview:', normalized.substring(0, 500));

    const firstGame = splitFirstGame(normalized);
    const g = new Chess();
    
    try {
      const loaded = loadPgnIntoGame(g, firstGame);
      
      if (!loaded || g.history().length === 0) {
        console.error('PGN loading failed. Moves parsed:', g.history().length);
        console.error('First game content:', firstGame.substring(0, 1000));
        setPgnError(`Could not parse PGN. Parsed ${g.history().length} moves. Check format.`);
        return;
      }

      console.log('PGN loaded successfully! Moves:', g.history().length);
      gameRef.current = g;
      setPgnError(null);
      setSelectedSquare(null);
      setLegalSquareStyles({});
      setPendingEval(null);
      applyGameState(g);
    } catch (err) {
      console.error('PGN parsing exception:', err);
      setPgnError(`Error parsing PGN: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const onPgnFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setPgnText(text);
      loadPgnText(text);
    };
    reader.onerror = () => setPgnError('Unable to read PGN file.');
    reader.readAsText(file);
  };

  const fetchChessComGames = async () => {
    const username = chessComUser.trim();
    if (!username) {
      setChessComError('Enter a Chess.com username.');
      return;
    }

    const fetchJson = async (url: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          mode: 'cors',
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 404) throw new Error('Player not found.');
          throw new Error('Chess.com API error.');
        }
        return await res.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    setChessComLoading(true);
    setChessComError(null);

    try {
      await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`);
      const archivesData = await fetchJson(
        `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
      );
      const archives = archivesData?.archives ?? [];
      if (!archives.length) throw new Error('No archives found for this user.');

      const recentArchives = archives.slice(-4);
      const archivesPayloads = await Promise.all(recentArchives.map((archive: string) => fetchJson(archive)));

      const merged = archivesPayloads.flatMap((payload) => payload?.games ?? []);
      const unique = new Map<string, ChessComGame>();

      merged
        .filter((game: any) => game?.pgn)
        .slice(-30)
        .reverse()
        .forEach((game: any) => {
          const id = game.uuid || game.url || `${game.end_time}-${game.white?.username ?? 'white'}`;
          if (unique.has(id)) return;
          unique.set(id, {
            id,
            white: game.white?.username ?? 'White',
            black: game.black?.username ?? 'Black',
            pgn: game.pgn ?? '',
            endTime: game.end_time,
            timeClass: game.time_class,
          });
        });

      const games = Array.from(unique.values());
      if (!games.length) throw new Error('No PGN data available for recent games.');

      setChessComGames(games);
      setChessComError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load games.';
      setChessComError(message);
      setChessComGames([]);
    } finally {
      setChessComLoading(false);
    }
  };

  const loadChessComGame = (game: ChessComGame) => {
    if (!game.pgn) {
      setChessComError('Game PGN unavailable.');
      return;
    }
    
    console.log('Loading Chess.com game:');
    console.log('White:', game.white, 'vs Black:', game.black);
    console.log('PGN length:', game.pgn.length);
    console.log('PGN start:', game.pgn.substring(0, 300));
    
    // Clear previous errors
    setChessComError(null);
    setPgnError(null);
    setPgnText(game.pgn);
    loadPgnText(game.pgn);
  };

  const checkSquareStyles = useMemo(() => {
    if (!checkState.check) return {};
    const kingSquare = getKingSquare(viewGame, viewGame.turn());
    if (!kingSquare) return {};
    return {
      [kingSquare]: {
        background: 'rgba(239, 68, 68, 0.22)',
        boxShadow: 'inset 0 0 0 2px rgba(239, 68, 68, 0.7)',
      },
    } as Record<string, React.CSSProperties>;
  }, [checkState.check, viewGame]);

  const squareStyles = useMemo(
    () => ({ ...legalSquareStyles, ...checkSquareStyles }),
    [legalSquareStyles, checkSquareStyles]
  );



  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text)]">
      <div className="mx-auto grid max-w-6xl grid-cols-12 gap-4 px-4 py-4">
        <aside className="col-span-12 md:col-span-3">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs tracking-[0.22em] text-[color:var(--accent)]">CHESSLARK</div>
                <div className="mt-1 text-lg font-semibold">Zero‑Latency Analysis</div>
              </div>
              <button
                onClick={() => setBoardOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/50"
              >
                Flip
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={onToggleTheme}
                className="flex-1 rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button
                onClick={() => setSoundEnabled((prev) => !prev)}
                className="flex-1 rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
              >
                {soundEnabled ? 'Sound On' : 'Sound Off'}
              </button>
            </div>

            <nav className="mt-4 grid gap-2">
              {(
                [
                  { k: 'home' as const, label: 'Home' },
                  { k: 'analysis' as const, label: 'Analysis' },
                  { k: 'openings' as const, label: 'Opening Learning' },
                  { k: 'learning' as const, label: 'General Learning' },
                ]
              ).map((item) => (
                <button
                  key={item.k}
                  onClick={() => onNavigate(item.k)}
                  className={`rounded-lg px-3 py-2 text-left text-sm transition border ${
                    activeRoute === item.k
                      ? 'border-[color:var(--accent)] bg-[color:var(--surface-2)] text-[color:var(--text)]'
                      : 'border-[color:var(--border)] bg-[color:var(--bg)] text-[color:var(--muted)] hover:border-[color:var(--accent)]/40 hover:text-[color:var(--text)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-4 flex gap-2">
              <button
                onClick={undo}
                className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
              >
                Undo
              </button>
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[color:var(--muted)]">Engine</div>
                <div className="text-xs text-[color:var(--muted-strong)]">Stockfish 18</div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-[color:var(--muted)]">Status</div>
                <div className="text-xs flex items-center gap-1.5">
                  {engine.error ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-red-500 rounded-full" />
                      <span className="text-red-400">Error</span>
                    </>
                  ) : engine.thinking ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-[color:var(--accent)] rounded-full animate-pulse" />
                      <span className="text-[color:var(--accent)]">Analyzing…</span>
                    </>
                  ) : engine.ready ? (
                    <>
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-green-400">Ready</span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      <span className="text-yellow-400">Loading…</span>
                    </>
                  )}
                </div>
              </div>
              {engine.error ? <div className="mt-2 text-xs text-red-300/90">{engine.error}</div> : null}
            </div>
          </div>
        </aside>

        <main className="col-span-12 md:col-span-9">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-1 hidden sm:block">
              <div className="h-full min-h-[520px] rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2">
                <div className="relative h-full overflow-hidden rounded-lg bg-white">
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 bg-black"
                    animate={{ height: `${100 - evaluationBarPercent}%` }}
                    transition={{ type: 'spring', stiffness: 260, damping: 34 }}
                  />
                  <div className="absolute left-0 top-0 h-full w-full ring-1 ring-inset ring-[color:var(--accent)]/20" />
                </div>
              </div>
            </div>

            <div className="col-span-12 sm:col-span-7">
              <div className="mb-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs tracking-[0.18em] text-[color:var(--accent)]">BOARD THEME</span>
                  <span className="text-xs text-[color:var(--muted)]">{currentTheme.name}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {BOARD_THEMES.map((themeItem, index) => (
                    <button
                      key={themeItem.name}
                      onClick={() => setActiveTheme(index)}
                      className={`relative rounded-lg p-2 transition-all border ${
                        activeTheme === index
                          ? 'border-[color:var(--accent)] scale-105 shadow-lg shadow-[color:var(--accent)]/20'
                          : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]'
                      }`}
                      title={themeItem.name}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex">
                          <div className="h-4 w-4 rounded-l" style={{ backgroundColor: themeItem.light }} />
                          <div className="h-4 w-4 rounded-r" style={{ backgroundColor: themeItem.dark }} />
                        </div>
                        <span className="max-w-full truncate text-[10px] text-[color:var(--muted)]">
                          {themeItem.name.split(' ')[0]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="relative rounded-xl border p-3 transition-all duration-300"
                style={{
                  borderColor: currentTheme.border,
                  backgroundColor: currentTheme.bg,
                }}
              >
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  animate={
                    checkState.mate
                      ? { boxShadow: '0 0 30px rgba(239, 68, 68, 0.45)' }
                      : checkState.check
                        ? { boxShadow: '0 0 18px rgba(212, 175, 55, 0.35)' }
                        : { boxShadow: '0 0 0 rgba(0,0,0,0)' }
                  }
                  transition={{ duration: 0.4 }}
                />
                {checkState.mate ? (
                  <motion.div
                    className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-red-400/40 bg-red-500/15 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    Checkmate
                  </motion.div>
                ) : checkState.check ? (
                  <motion.div
                    className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    Check
                  </motion.div>
                ) : null}

                <Chessboard
                  options={{
                    position: fen,
                    onPieceDrop: onDrop,
                    onSquareClick,
                    boardOrientation,
                    animationDurationInMs: 220,
                    darkSquareStyle: { backgroundColor: currentTheme.dark },
                    lightSquareStyle: { backgroundColor: currentTheme.light },
                    squareStyles,
                  }}
                />
              </div>
            </div>

            <div className="col-span-12 sm:col-span-4">
              <div className="grid gap-4">
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs tracking-[0.18em] text-[color:var(--accent)]">ANALYSIS</div>
                    <div className="text-xs text-[color:var(--muted)]">Depth 12</div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[color:var(--muted)]">Evaluation</div>
                      <div className="font-mono text-sm text-[color:var(--text)]">{engine.evalDisplay}</div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[color:var(--muted)]">Best Move</div>
                      <div className="font-mono text-sm text-[color:var(--text)]">{uciToHuman(engine.bestMove)}</div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[color:var(--muted)]">Status</div>
                      <div className="text-xs text-[color:var(--muted-strong)]">
                        {checkState.mate ? 'Checkmate' : checkState.check ? 'Check' : 'Stable'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[color:var(--muted)]">Speed</div>
                      <div className="text-xs text-[color:var(--muted-strong)]">
                        {engine.thinking ? 'Analyzing...' : 'Ready'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-[color:var(--muted)]">Top Lines</div>
                    <div className="mt-2 grid gap-2">
                      {engine.lines.length === 0 ? (
                        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-2 text-[11px] text-[color:var(--muted)]">
                          Waiting for analysis…
                        </div>
                      ) : (
                        engine.lines.map((line, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-2"
                          >
                            <div className="flex items-center justify-between text-[11px] text-[color:var(--muted)]">
                              <span>Line {idx + 1}</span>
                              <span className="font-mono text-[color:var(--text)]">
                                {line.eval}
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-[color:var(--muted-strong)]">
                              {line.pv ?? '—'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs tracking-[0.18em] text-[color:var(--accent)]">MOVES</div>
                    <div className="text-xs text-[color:var(--muted)]">{moveHistory.length} ply</div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setViewPosition(0)}
                      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                    >
                      ⇤
                    </button>
                    <button
                      onClick={() => setViewPosition(viewPly - 1)}
                      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => setViewPosition(viewPly + 1)}
                      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                    >
                      →
                    </button>
                    <button
                      onClick={() => setViewPosition(moveHistory.length)}
                      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                    >
                      ⇥
                    </button>
                    <span className="ml-auto text-[11px] text-[color:var(--muted)]">
                      Viewing {viewPly}/{moveHistory.length}
                    </span>
                  </div>

                  <div className="mt-3 max-h-[280px] overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-2">
                    {moveHistory.length === 0 ? (
                      <div className="p-2 text-xs text-[color:var(--muted)]">Make a move to begin analysis.</div>
                    ) : (
                      <ol className="grid gap-1">
                        {moveHistory.map((m, index) => {
                          const tag = m.tag ? MOVE_TAGS[m.tag] : null;
                          const isActive = index + 1 === viewPly;
                          return (
                            <li
                              key={`${m.ply}-${m.san}`}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${
                                isActive ? 'bg-[color:var(--surface-2)]' : ''
                              }`}
                            >
                              <button
                                onClick={() => setViewPosition(index + 1)}
                                className="flex flex-1 items-center gap-2 text-left"
                              >
                                <span className="text-[11px] text-[color:var(--muted-soft)]">{m.ply}.</span>
                                <span className="flex-1 font-mono text-[12px] text-[color:var(--text)]">{m.san}</span>
                              </button>
                              {tag ? (
                                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${tag.bg} ${tag.color}`}>
                                  <span>{tag.icon}</span>
                                  {tag.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[color:var(--muted-soft)]">—</span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <div className="text-xs tracking-[0.18em] text-[color:var(--accent)]">ADVANCED ANALYSIS</div>
                  <div className="mt-3 grid gap-4">
                    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
                      <div className="text-xs text-[color:var(--muted)]">Import PGN</div>
                      <textarea
                        value={pgnText}
                        onChange={(event) => setPgnText(event.target.value)}
                        placeholder="Paste PGN here"
                        className="mt-2 h-28 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] p-2 text-xs text-[color:var(--muted-strong)] placeholder:text-[color:var(--muted-soft)] focus:border-[color:var(--accent)]/60 focus:outline-none"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => loadPgnText(pgnText)}
                          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                        >
                          Load PGN
                        </button>
                        <label className="cursor-pointer rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40">
                          Upload PGN
                          <input type="file" accept=".pgn" className="hidden" onChange={onPgnFileChange} />
                        </label>
                        <button
                          onClick={() => {
                            setPgnText('');
                            setPgnError(null);
                          }}
                          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted)] hover:border-[color:var(--accent)]/40"
                        >
                          Clear
                        </button>
                        {pgnError ? <span className="text-xs text-red-300">{pgnError}</span> : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
                      <div className="text-xs text-[color:var(--muted)]">Quick Sample Games</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const pgn = `[Event "F/S Return Match"]
[Site "Belgrade, Serbia JUG"]
[Date "1992.11.04"]
[Round "29"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Na4 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nxc5 Nxc5 21. Bc2 Rfd8 22. Ne5 Qxd6 23. Nf3 Qf6 24. Nd4 Ne6 25. Bb3 Nxd4 26. Qxd4 Qxd4 27. cxd4`;
                            setPgnText(pgn);
                            loadPgnText(pgn);
                          }}
                          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                        >
                          🎲 Fischer vs Spassky
                        </button>
                        <button
                          onClick={() => {
                            const pgn = `[Event "London"]
[Site "London ENG"]
[Date "1851.06.21"]
[Round "?"]
[White "Anderssen, Adolf"]
[Black "Kieseritzky, Lionel"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2`;
                            setPgnText(pgn);
                            loadPgnText(pgn);
                          }}
                          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                        >
                          ⚔️ Immortal Game
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] p-3">
                      <div className="text-xs text-[color:var(--muted)]">Chess.com Games</div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={chessComUser}
                          onChange={(event) => setChessComUser(event.target.value)}
                          placeholder="username"
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] placeholder:text-[color:var(--muted-soft)] focus:border-[color:var(--accent)]/60 focus:outline-none"
                        />
                        <button
                          onClick={fetchChessComGames}
                          className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40"
                        >
                          {chessComLoading ? 'Loading…' : 'Load'}
                        </button>
                      </div>
                      {chessComError ? <div className="mt-2 text-xs text-red-300">{chessComError}</div> : null}
                      {chessComGames.length > 0 ? (
                        <div className="mt-3 grid gap-2">
                          {chessComGames.map((game) => (
                            <button
                              key={game.id}
                              onClick={() => loadChessComGame(game)}
                              className="flex items-center justify-between rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-2)] px-3 py-2 text-xs text-[color:var(--muted-strong)] hover:border-[color:var(--accent)]/40 hover:text-[color:var(--text)]"
                            >
                              <span className="truncate">
                                {game.white} vs {game.black}
                              </span>
                              <span className="text-[10px] text-[color:var(--muted-soft)]">
                                {game.timeClass ? game.timeClass.toUpperCase() : 'GAME'}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-[color:var(--muted-soft)]">
                          Load games to analyze recent Chess.com activity.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-[color:var(--muted-soft)]">
        Tip: Put <span className="text-[color:var(--muted-strong)]">stockfish-18.js</span> in the{' '}
        <span className="text-[color:var(--muted-strong)]">public/</span> folder so it loads at{' '}
        <span className="text-[color:var(--muted-strong)]">/stockfish-18.js</span>.
      </footer>
    </div>
  );
}
