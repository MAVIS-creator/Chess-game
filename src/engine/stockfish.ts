import { getApiAuthHeaders } from "../auth/apiSession";
import type { RawEngineLine } from "./candidateMoves";
import { normalizeCandidateMoves, type EngineCandidateMove } from "./candidateMoves";

export interface EngineAnalysisRequest {
  fen: string;
  depth: number;
  multiPv: number;
  mate?: number | null;
  moveTimeMs?: number;
  timeoutMs?: number;
}

export interface EngineAnalysisResult {
  bestMove: string;
  candidates: EngineCandidateMove[];
  source?: "gcp-stockfish-19" | "local-stockfish-19";
}

interface RemoteAnalysisLine {
  move_uci?: string | null;
  depth?: number | null;
  score?: {
    centipawns?: number | null;
    mate_in?: number | null;
  } | null;
  pv?: {
    uci?: string[];
  } | null;
}

interface RemoteAnalysisResponse {
  best_move_uci?: string | null;
  lines?: RemoteAnalysisLine[];
}

const STOCKFISH_SCRIPT_URL = "/stockfish/stockfish-19-lite-single.js";

const clampInt = (value: number | undefined, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value ?? fallback)));
};

class LocalStockfish19Engine {
  private worker: Worker | null = null;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;
  private searchRequestId = 0;
  private timeoutId: number | null = null;
  private searchPromise:
    | {
        requestId: number;
        resolve: (value: EngineAnalysisResult) => void;
        reject: (reason?: unknown) => void;
        lines: Map<number, RawEngineLine>;
      }
    | null = null;

  async analyzePosition(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    await this.ensureReady();

    if (!this.worker) {
      throw new Error("Local Stockfish 19 worker failed to initialize.");
    }

    if (this.searchPromise) {
      const previous = this.searchPromise;
      this.post("stop");
      this.clearSearchTimeout();
      this.searchPromise = null;
      previous.reject(new Error("Local engine search was superseded by a newer request."));
    }

    return new Promise<EngineAnalysisResult>((resolve, reject) => {
      const requestId = ++this.searchRequestId;
      this.searchPromise = {
        requestId,
        resolve,
        reject,
        lines: new Map()
      };

      this.post("position fen " + request.fen);
      this.post(`setoption name MultiPV value ${clampInt(request.multiPv, 1, 5, 1)}`);

      const timeoutMs = clampInt(request.timeoutMs, 300, 16_000, 4500);
      this.timeoutId = window.setTimeout(() => {
        if (this.searchPromise?.requestId === requestId) {
          this.post("stop");
        }
      }, timeoutMs);

      if (request.mate && request.mate > 0) {
        this.post(`go mate ${clampInt(request.mate, 1, 12, 3)}`);
        return;
      }

      if (request.moveTimeMs && request.moveTimeMs > 0) {
        this.post(`go movetime ${clampInt(request.moveTimeMs, 50, 12_000, 1000)}`);
        return;
      }

      this.post(`go depth ${clampInt(request.depth, 1, 40, 16)}`);
    });
  }

  dispose() {
    this.clearSearchTimeout();
    if (this.searchPromise) {
      this.searchPromise.reject(new Error("Local engine disposed."));
      this.searchPromise = null;
    }
    this.post("quit");
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.isReady = false;
  }

  private async ensureReady() {
    if (this.isReady) {
      return;
    }

    if (!this.readyPromise) {
      this.worker = new Worker(STOCKFISH_SCRIPT_URL, { type: "classic", name: "stockfish-19-lite" });
      this.readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("Local Stockfish 19 did not become ready in time."));
        }, 15_000);

        this.worker?.addEventListener("message", (event: MessageEvent<string>) => {
          const line = event.data;

          if (line === "uciok") {
            this.configureEngineDefaults();
            this.post("isready");
            return;
          }

          if (line === "readyok") {
            this.isReady = true;
            window.clearTimeout(timeout);
            resolve();
            return;
          }

          this.handleEngineLine(line);
        });

        this.worker?.addEventListener("error", (event) => {
          window.clearTimeout(timeout);
          reject(event.error ?? new Error("Local Stockfish 19 worker crashed."));
        });

        this.post("uci");
      });
    }

    await this.readyPromise;
  }

  private handleEngineLine(line: string) {
    const search = this.searchPromise;
    if (!search) {
      return;
    }

    if (line.startsWith("info ")) {
      const parsed = this.parseInfoLine(line);
      if (parsed) {
        search.lines.set(parsed.multipv, parsed);
      }
      return;
    }

    if (!line.startsWith("bestmove ")) {
      return;
    }

    const bestMove = line.split(/\s+/)[1];
    this.clearSearchTimeout();

    if (!bestMove || bestMove === "(none)") {
      this.searchPromise = null;
      search.reject(new Error("Local Stockfish 19 returned no move."));
      return;
    }

    const candidates = normalizeCandidateMoves([...search.lines.values()]);
    search.resolve({
      bestMove,
      candidates:
        candidates.length > 0
          ? candidates
          : [{ move: bestMove, score: 0, depth: 0, label: "best", pv: [bestMove], mateIn: null }],
      source: "local-stockfish-19"
    });
    this.searchPromise = null;
  }

  private parseInfoLine(line: string): RawEngineLine | null {
    const depthMatch = line.match(/\bdepth (\d+)/);
    const multiPvMatch = line.match(/\bmultipv (\d+)/);
    const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?(?: [a-h][1-8][a-h][1-8][qrbn]?)+|[a-h][1-8][a-h][1-8][qrbn]?)/);

    if (!depthMatch || !multiPvMatch || !pvMatch) {
      return null;
    }

    const scoreMateMatch = line.match(/\bscore mate (-?\d+)/);
    const scoreCpMatch = line.match(/\bscore cp (-?\d+)/);

    return {
      depth: Number(depthMatch[1]),
      multipv: Number(multiPvMatch[1]),
      scoreCp: scoreCpMatch ? Number(scoreCpMatch[1]) : null,
      mateIn: scoreMateMatch ? Number(scoreMateMatch[1]) : null,
      pv: pvMatch[1].trim().split(/\s+/)
    };
  }

  private post(command: string) {
    this.worker?.postMessage(command);
  }

  private clearSearchTimeout() {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private configureEngineDefaults() {
    this.post("setoption name Skill Level value 20");
    this.post("setoption name UCI_LimitStrength value false");
    this.post("setoption name Hash value 64");
  }
}

export class StockfishEngine {
  private readonly local = new LocalStockfish19Engine();

  async analyzePosition(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    try {
      return await this.analyzeRemote(request);
    } catch {
      return this.local.analyzePosition(request);
    }
  }

  dispose() {
    this.local.dispose();
  }

  private async analyzeRemote(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    const headers = await getApiAuthHeaders();
    if (!headers.Authorization) {
      throw new Error("No authenticated session for remote engine.");
    }

    const controller = new AbortController();
    const timeoutMs = clampInt(request.timeoutMs, 700, 16_000, Math.max(1800, (request.moveTimeMs ?? 1000) + 2500));
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch("/api/engine", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fen: request.fen,
          depth: clampInt(request.depth, 1, 40, 16),
          multiPv: clampInt(request.multiPv, 1, 5, 1),
          timeMs: clampInt(request.moveTimeMs, 50, 12_000, request.mate ? 900 : 1200),
          timeoutMs
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Remote engine rejected the request.");
      }

      const data = (await response.json()) as RemoteAnalysisResponse;
      const rawLines: RawEngineLine[] = (data.lines ?? [])
        .map((line, index) => ({
          depth: line.depth ?? request.depth,
          multipv: index + 1,
          scoreCp: line.score?.centipawns ?? null,
          mateIn: line.score?.mate_in ?? null,
          pv: line.pv?.uci?.length
            ? line.pv.uci
            : line.move_uci
              ? [line.move_uci]
              : []
        }))
        .filter((line) => line.pv.length > 0);

      const candidates = normalizeCandidateMoves(rawLines);
      const bestMove = data.best_move_uci ?? candidates[0]?.move;

      if (!bestMove) {
        throw new Error("Remote engine returned no legal move candidate.");
      }

      return {
        bestMove,
        candidates:
          candidates.length > 0
            ? candidates
            : [{ move: bestMove, score: 0, depth: request.depth, label: "best", pv: [bestMove], mateIn: null }],
        source: "gcp-stockfish-19"
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
