import { useState, useEffect, useRef, useCallback } from 'react';

type EngineState = {
  ready: boolean;
  thinking: boolean;
  bestMove: string;
  evaluation: number;
  evalDisplay: string;
  lines: Array<{ move: string; eval: string; pv: string }>;
  error: string | null;
  status: string;
};

export function useEngine() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<EngineState>({
    ready: false,
    thinking: false,
    bestMove: '',
    evaluation: 0,
    evalDisplay: '0.0',
    lines: [],
    error: null,
    status: 'Initializing...',
  });

  const pendingAnalysisRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const currentFenRef = useRef<string>('');

  useEffect(() => {
    console.log('=== STOCKFISH INITIALIZATION ===');
    
    let worker: Worker | null = null;
    let initTimeout: ReturnType<typeof setTimeout>;

    try {
      console.log('[1/5] Creating Worker from /stockfish-18.js...');
      
      // Load Stockfish Web Worker directly
      worker = new Worker('/stockfish-18.js');
      workerRef.current = worker;
      console.log('[1/5] ✓ Worker created');

      worker.onmessage = (e: MessageEvent) => {
        const msg = String(e.data || '');
        console.log('Stockfish →', msg);

        // UCI handshake complete
        if (msg.includes('uciok')) {
          console.log('[2/5] ✓ UCI OK - Configuring engine...');
          clearTimeout(initTimeout);
          worker?.postMessage('setoption name MultiPV value 3');
          worker?.postMessage('setoption name Threads value 1');
          worker?.postMessage('setoption name Hash value 16');
          worker?.postMessage('isready');
          setState(prev => ({ ...prev, status: 'Configuring...', error: null }));
        }
        // Engine ready
        else if (msg.includes('readyok')) {
          console.log('[3/5] ✓ READY - Engine online!');
          readyRef.current = true;
          setState(prev => ({
            ...prev,
            ready: true,
            status: 'Ready',
            error: null,
          }));

          // Start pending analysis if any
          if (pendingAnalysisRef.current) {
            const fen = pendingAnalysisRef.current;
            pendingAnalysisRef.current = null;
            setTimeout(() => startAnalysis(fen), 100);
          }
        }
        // Analysis info
        else if (msg.startsWith('info')) {
          handleInfoLine(msg);
        }
        // Best move found
        else if (msg.startsWith('bestmove')) {
          const parts = msg.split(' ');
          const move = parts[1] || '';
          console.log('[4/5] ✓ Best move:', move);
          setState(prev => ({
            ...prev,
            bestMove: move,
            thinking: false,
          }));
        }
      };

      worker.onerror = (err) => {
        console.error('Worker ERROR:', err);
        setState(prev => ({
          ...prev,
          error: 'Failed to load Stockfish engine',
          status: 'Error',
        }));
      };

      // Start UCI handshake
      console.log('[0/5] Sending "uci" command...');
      worker.postMessage('uci');

      // Timeout after 15 seconds
      initTimeout = setTimeout(() => {
        console.error('[ERROR] Stockfish not responding after 15s');
        console.error('Check if /stockfish-18.js exists in public/ folder');
        setState(prev => ({
          ...prev,
          error: 'Engine timeout. Check console logs.',
          status: 'Timeout',
        }));
      }, 15000);

    } catch (err) {
      console.error('[FATAL] Worker creation failed:', err);
      setState(prev => ({
        ...prev,
        error: `Cannot load Stockfish: ${err}`,
        status: 'Failed',
      }));
    }

    return () => {
      console.log('=== STOCKFISH CLEANUP ===');
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  const handleInfoLine = (line: string) => {
    // Parse: info depth 12 score cp 35 multipv 1 pv e2e4 e7e5
    const depthMatch = line.match(/depth (\d+)/);
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch = line.match(/pv (.+?)(?:\s|$)/);
    const multipvMatch = line.match(/multipv (\d+)/);

    if (!depthMatch || !pvMatch) return;

    const depth = parseInt(depthMatch[1]);
    if (depth < 10) return; // Skip shallow searches

    const pvMoves = pvMatch[1].split(' ');
    const firstMove = pvMoves[0];
    const lineIndex = multipvMatch ? parseInt(multipvMatch[1]) - 1 : 0;

    let evalNum = 0;
    let evalStr = '0.0';

    if (cpMatch) {
      // Convert centipawns to pawns
      evalNum = parseInt(cpMatch[1]) / 100;
      evalStr = evalNum >= 0 ? `+${evalNum.toFixed(1)}` : evalNum.toFixed(1);
    } else if (mateMatch) {
      const mateIn = parseInt(mateMatch[1]);
      evalNum = mateIn > 0 ? 100 : -100;
      evalStr = mateIn > 0 ? `#+${mateIn}` : `#${mateIn}`;
    }

    setState(prev => {
      const newLines = [...prev.lines];
      newLines[lineIndex] = {
        move: firstMove,
        eval: evalStr,
        pv: pvMoves.slice(0, 5).join(' '),
      };

      // Update main eval from first line
      return {
        ...prev,
        evaluation: lineIndex === 0 ? evalNum : prev.evaluation,
        evalDisplay: lineIndex === 0 ? evalStr : prev.evalDisplay,
        lines: newLines.slice(0, 3),
      };
    });
  };

  const startAnalysis = useCallback((fen: string) => {
    if (!workerRef.current) {
      console.warn('Worker not available');
      return;
    }

    if (!readyRef.current) {
      console.log('Engine not ready, queuing...');
      pendingAnalysisRef.current = fen;
      return;
    }

    console.log('[5/5] ✓ Analyzing position');
    currentFenRef.current = fen;

    setState(prev => ({
      ...prev,
      thinking: true,
      lines: [],
    }));

    workerRef.current.postMessage('stop');
    workerRef.current.postMessage(`position fen ${fen}`);
    workerRef.current.postMessage('go depth 12');
  }, []);

  return {
    ready: state.ready,
    thinking: state.thinking,
    bestMove: state.bestMove,
    evaluation: state.evaluation,
    evalDisplay: state.evalDisplay,
    lines: state.lines,
    error: state.error,
    status: state.status,
    analyze: startAnalysis,
  };
}

export default useEngine;
