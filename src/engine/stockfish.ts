import type { RawEngineLine } from "./candidateMoves";
import { normalizeCandidateMoves, type EngineCandidateMove } from "./candidateMoves";

export interface EngineAnalysisRequest {
  fen: string;
  depth: number;
  multiPv: number;
}

export interface EngineAnalysisResult {
  bestMove: string;
  candidates: EngineCandidateMove[];
}

const STOCKFISH_SCRIPT_URL = "/stockfish/stockfish-18-lite-single.js";
const STOCKFISH_WASM_URL = "/stockfish/stockfish-18-lite-single.wasm";

const buildWorkerUrl = () => `${STOCKFISH_SCRIPT_URL}#${encodeURIComponent(STOCKFISH_WASM_URL)}`;

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady = false;
  private readyPromise: Promise<void> | null = null;
  private searchPromise:
    | {
        resolve: (value: EngineAnalysisResult) => void;
        reject: (reason?: unknown) => void;
        lines: Map<number, RawEngineLine>;
      }
    | null = null;

  async analyzePosition(request: EngineAnalysisRequest): Promise<EngineAnalysisResult> {
    await this.ensureReady();

    if (!this.worker) {
      throw new Error("Stockfish worker failed to initialize.");
    }

    return new Promise<EngineAnalysisResult>((resolve, reject) => {
      this.searchPromise = {
        resolve,
        reject,
        lines: new Map()
      };

      this.post("ucinewgame");
      this.post("position fen " + request.fen);
      this.post(`setoption name MultiPV value ${request.multiPv}`);
      this.post(`go depth ${request.depth}`);
    });
  }

  dispose() {
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
      this.worker = new Worker(buildWorkerUrl(), { type: "classic", name: "stockfish-lite" });
      this.readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("Stockfish did not become ready in time."));
        }, 15000);

        this.worker?.addEventListener("message", (event: MessageEvent<string>) => {
          const line = event.data;

          if (line === "uciok") {
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
          reject(event.error ?? new Error("Stockfish worker crashed."));
        });

        this.post("uci");
      });
    }

    await this.readyPromise;
  }

  private handleEngineLine(line: string) {
    if (!this.searchPromise) {
      return;
    }

    if (line.startsWith("info ")) {
      const parsed = this.parseInfoLine(line);
      if (parsed) {
        this.searchPromise.lines.set(parsed.multipv, parsed);
      }
      return;
    }

    if (line.startsWith("bestmove ")) {
      const bestMove = line.split(/\s+/)[1];
      const candidates = normalizeCandidateMoves([...this.searchPromise.lines.values()]);
      const result: EngineAnalysisResult = {
        bestMove,
        candidates:
          candidates.length > 0
            ? candidates
            : [{ move: bestMove, score: 0, depth: 0, label: "best", pv: [bestMove], mateIn: null }]
      };
      this.searchPromise.resolve(result);
      this.searchPromise = null;
    }
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
}
