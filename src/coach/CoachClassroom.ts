import { Chess, type Square } from "chess.js";
import { StockfishEngine } from "../engine/stockfish";
import "./coach.css";

const PIECES: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "\u265F\uFE0E"
};
const START_FEN = new Chess().fen();
type Message = { role: "student" | "coach"; text: string };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void; stop(): void;
};
type RecognitionFactory = new () => Recognition;
const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function mountCoachClassroom(root: HTMLElement, playerName: string, onBack: () => void): () => void {
  document.body.classList.add("coach-mode");
  const engine = new StockfishEngine();
  let fens = [START_FEN], moves: string[] = [], ply = 0;
  let selected: Square | null = null;
  let best: { from: Square; to: Square; san: string } | null = null;
  let busy = false, dead = false, flipped = false, version = 0;
  let title = "Exploration board";
  let recognition: Recognition | null = null;
  const messages: Message[] = [{
    role: "coach",
    text: "Welcome to Cedar's chess classroom! Import a PGN or move the pieces. I can explain chess concepts and use Stockfish to suggest a move."
  }];
  const gameAt = () => new Chess(fens[ply]);
  root.innerHTML = [
    '<main class="cedar-coach-shell">',
    '<header class="coach-top"><div class="coach-brand"><span>♞</span><div><strong>CEDAR CHESS</strong><small>THE CHESS ACADEMY</small></div></div><nav><button id="coach-back" type="button">← Back to Cedar</button><span class="coach-tier">✦ Cedar Lite · Preview</span></nav></header>',
    '<section class="coach-hero"><div><span class="coach-eyebrow">YOUR PRIVATE CHESS CLASSROOM</span><h1>Think deeper. <em>Play better.</em></h1><p>Study real positions, replay your games, and learn with a thoughtful engine-backed companion.</p></div><span class="coach-hero-mark">✦ CEDAR AI</span></section>',
    '<section class="coach-layout"><div class="coach-board-side">',
    '<div class="coach-card-head"><div><strong id="coach-game-title">Exploration board</strong><small id="coach-turn">White to move</small></div><div><button id="coach-flip">⇅ Flip</button><button id="coach-reset">↺ Reset</button></div></div>',
    '<div class="coach-board-wrap"><div id="coach-board" class="coach-board" role="group" aria-label="Interactive chessboard"></div></div>',
    '<div class="coach-engine-strip"><span id="coach-engine-status">♟ Stockfish 19 • ready</span><button id="coach-analyze">✦ Analyze position</button></div>',
    '<div class="coach-playback"><strong>Game replay</strong><small id="coach-ply"></small><div><button id="coach-first" aria-label="Start">|◀</button><button id="coach-prev" aria-label="Back">◀</button><button id="coach-next" aria-label="Next">▶</button><button id="coach-last" aria-label="End">▶|</button></div></div>',
    '<div class="coach-moves" id="coach-moves"></div>',
    '<details class="coach-import" open><summary>PGN and FEN tools</summary><label>Upload a PGN<input id="coach-file" type="file" accept=".pgn,.txt" /></label><label>Paste game notation<textarea id="coach-pgn" rows="3" placeholder="1. e4 e5 2. Nf3 Nc6"></textarea></label><div class="coach-inline"><button id="coach-import-pgn">Import PGN</button><button id="coach-export">Export PGN</button></div><label>FEN<input id="coach-fen" placeholder="Paste a valid FEN position" /></label><button id="coach-import-fen">Load position</button><p id="coach-import-status" role="status"></p></details>',
    '</div><aside class="coach-talk-side">',
    '<div class="coach-profile"><div class="coach-profile-icon">✦</div><div><strong>Cedar</strong><small>Your chess learning companion</small></div><span class="coach-available">● Study ready</span></div>',
    '<div class="coach-mode-switch"><button data-mode="teach" class="active">Teaching mode</button><button data-mode="analyze">Analysis mode</button></div>',
    '<div id="coach-messages" class="coach-messages" aria-live="polite"></div>',
    '<div class="coach-suggestions"><button data-question="What is the best move?">Best move?</button><button data-question="Explain the opening principles.">Opening ideas</button><button data-question="What is a knight fork?">Knight forks</button></div>',
    '<form id="coach-form" class="coach-composer"><input id="coach-question" aria-label="Ask Cedar a chess question" maxlength="500" placeholder="Ask Cedar about this position…" /><button type="button" id="coach-mic" title="Speech input, if supported">🎙</button><button type="submit" id="coach-send">➤</button></form>',
    '<label class="coach-speak"><input id="coach-read-aloud" type="checkbox" /> Read replies aloud (browser voice)</label>',
    '<p class="coach-preview-note">MVP: rules, PGN, FEN and Stockfish are functional. Natural expressive laughter, full conversational model, cloud memory and enhanced subscriptions are not yet enabled. Engine assistance is for permitted study only.</p>',
    '</aside></section></main>'
  ].join("");
  const byId = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const notify = (text: string) => { byId("coach-import-status").textContent = text; };
  const renderChat = () => {
    const container = byId("coach-messages");
    container.innerHTML = messages.map(m => '<div class="coach-bubble ' + m.role + '"><small>'
      + (m.role === "coach" ? "✦ Cedar" : escapeHtml(playerName))
      + '</small><p>' + escapeHtml(m.text) + "</p></div>").join("");
    container.scrollTop = container.scrollHeight;
  };
  const say = (text: string) => {
    if (!byId<HTMLInputElement>("coach-read-aloud").checked || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    const available = window.speechSynthesis.getVoices();
    const voice = available.find(v => /Samantha|Jenny|Aria|Zira|Victoria|female/i.test(v.name) && v.lang.startsWith("en"))
      || available.find(v => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  };
  const reply = (text: string) => { messages.push({ role: "coach", text }); renderChat(); say(text); };
  const goto = (index: number) => {
    ply = Math.max(0, Math.min(moves.length, index));
    selected = null; best = null; version++;
    renderBoard();
  };
  const renderBoard = () => {
    const game = gameAt();
    const ranks = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
    const files = flipped ? "hgfedcba" : "abcdefgh";
    const legal = selected ? game.moves({ square: selected, verbose: true }).map(m => m.to) : [];
    const grid = byId("coach-board");
    grid.replaceChildren();
    for (const rank of ranks) for (const file of files) {
      const square = (file + rank) as Square;
      const piece = game.get(square);
      const light = ("abcdefgh".indexOf(file) + rank) % 2 === 0;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "coach-square " + (light ? "light" : "dark")
        + (selected === square ? " selected" : "")
        + (legal.includes(square) ? " target" : "")
        + (best?.from === square ? " best-from" : "")
        + (best?.to === square ? " best-to" : "");
      cell.setAttribute("aria-label", square + (piece ? " " + piece.color + piece.type : ""));
      cell.textContent = piece ? PIECES[piece.color + piece.type] : "";
      cell.addEventListener("click", () => {
        const now = gameAt(), p = now.get(square);
        if (selected) {
          try {
            const candidates = now.moves({ square: selected, verbose: true }).filter(m => m.to === square);
            if (candidates.length) {
              const m = now.move({ from: selected, to: square, promotion: candidates.some(c => c.promotion) ? "q" : undefined });
              moves = moves.slice(0, ply); fens = fens.slice(0, ply + 1);
              moves.push(m.san); fens.push(now.fen());
              title = "Exploration board"; goto(ply + 1); return;
            }
          } catch { /* Keep board unchanged for illegal moves. */ }
        }
        selected = p?.color === now.turn() ? square : null;
        renderBoard();
      });
      grid.append(cell);
    }
    byId("coach-game-title").textContent = title;
    byId("coach-turn").textContent = game.isGameOver() ? "Game finished" : (game.turn() === "w" ? "White" : "Black") + " to move";
    byId("coach-ply").textContent = String(ply) + " / " + String(moves.length) + " plies";
    const history = byId("coach-moves");
    history.replaceChildren();
    if (!moves.length) history.textContent = "Make a move or import a completed game.";
    moves.forEach((m, index) => {
      const b = document.createElement("button");
      b.textContent = String(Math.ceil((index + 1) / 2)) + (index % 2 ? "... " : ". ") + m;
      b.className = index + 1 === ply ? "active" : "";
      b.addEventListener("click", () => goto(index + 1));
      history.append(b);
    });
    for (const id of ["coach-first","coach-prev"]) byId<HTMLButtonElement>(id).disabled = ply === 0;
    for (const id of ["coach-next","coach-last"]) byId<HTMLButtonElement>(id).disabled = ply === moves.length;
  };
  const loadPgn = (pgn: string) => {
    if (pgn.length > 200000) { notify("PGN is too large for the preview."); return; }
    try {
      const imported = new Chess();
      imported.loadPgn(pgn);
      const headers = imported.getHeaders();
      const replay = headers.FEN ? new Chess(headers.FEN) : new Chess();
      const nextFens = [replay.fen()];
      const nextMoves: string[] = [];
      for (const move of imported.history({ verbose: true })) {
        const played = replay.move({ from: move.from, to: move.to, promotion: move.promotion });
        nextMoves.push(played.san);
        nextFens.push(replay.fen());
      }
      if (!nextMoves.length) throw Error("No moves");
      moves = nextMoves; fens = nextFens;
      title = [headers.White, headers.Black].filter(Boolean).join(" vs ") || "Imported game";
      goto(moves.length);
      notify("Loaded " + moves.length + " plies. " + title);
      reply("Your game is loaded. Use the move controls to inspect any position. Which player were you, White or Black?");
    } catch { notify("Could not parse PGN. Check its format and try again."); }
  };
  const analyze = async () => {
    if (busy) return;
    const game = gameAt();
    if (game.isGameOver()) { reply("This game has finished. Rewind to a position you'd like to analyze."); return; }
    busy = true;
    const v = version, fen = game.fen();
    byId<HTMLButtonElement>("coach-analyze").disabled = true;
    byId("coach-engine-status").textContent = "♟ Stockfish 19 • analyzing…";
    try {
      const result = await engine.analyzePosition({ fen, depth: 14, multiPv: 3, moveTimeMs: 1100, timeoutMs: 4200 });
      if (dead || v !== version) return;
      const uci = result.bestMove;
      const proof = new Chess(fen);
      const legalMove = proof.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!legalMove) throw Error("Illegal result");
      best = { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, san: legalMove.san };
      byId("coach-engine-status").textContent = "♟ " + (result.source || "Stockfish 19") + " • " + legalMove.san;
      renderBoard();
      reply("Stockfish suggests " + legalMove.san + ". The green highlighted squares show the proposed move. Try exploring the continuation on the board.");
    } catch {
      if (!dead && v === version) reply("The engine is unavailable right now. Try again or continue studying the moves locally.");
    } finally {
      busy = false;
      if (!dead) byId<HTMLButtonElement>("coach-analyze").disabled = false;
    }
  };
  const ask = (question: string) => {
    const q = question.trim().slice(0, 500);
    if (!q) return;
    messages.push({ role: "student", text: q }); renderChat();
    byId<HTMLInputElement>("coach-question").value = "";
    const lower = q.toLowerCase();
    if (/best|analy|strongest|evaluate|stockfish/.test(lower)) { void analyze(); return; }
    if (/fork/.test(lower)) { reply("A fork attacks multiple targets with one piece. Knights can fork kings, queens and rooks. Look for checking jumps first."); return; }
    if (/pin/.test(lower)) { reply("A pin occurs when moving a piece would expose something more valuable behind it. Let's look for pieces lined up on files, ranks or diagonals."); return; }
    if (/opening|center|develop/.test(lower)) { reply("In the opening, control the center, develop your minor pieces, and keep your king safe. The best plan depends on the position."); return; }
    if (/castle/.test(lower)) { reply("Castling moves your king two squares toward a rook, then the rook beside it. Your king cannot castle out of, through, or into check."); return; }
    reply("I can currently help with opening principles, forks, pins, castling, and Stockfish-backed move suggestions. Open-ended AI coaching and expressive neural voice will be enabled after the secure backend and limits are configured.");
  };
  byId("coach-first").addEventListener("click", () => goto(0));
  byId("coach-prev").addEventListener("click", () => goto(ply - 1));
  byId("coach-next").addEventListener("click", () => goto(ply + 1));
  byId("coach-last").addEventListener("click", () => goto(moves.length));
  byId("coach-reset").addEventListener("click", () => { fens = [START_FEN]; moves = []; title = "Exploration board"; goto(0); });
  byId("coach-flip").addEventListener("click", () => { flipped = !flipped; renderBoard(); });
  byId("coach-analyze").addEventListener("click", () => { void analyze(); });
  byId("coach-import-pgn").addEventListener("click", () => loadPgn(byId<HTMLTextAreaElement>("coach-pgn").value));
  byId<HTMLInputElement>("coach-file").addEventListener("change", async e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) loadPgn(await file.text());
  });
  byId("coach-import-fen").addEventListener("click", () => {
    try {
      const chess = new Chess(byId<HTMLInputElement>("coach-fen").value.trim());
      fens = [chess.fen()]; moves = []; title = "Custom FEN"; goto(0); notify("FEN imported.");
    } catch { notify("Invalid FEN position."); }
  });
  byId("coach-export").addEventListener("click", () => {
    const game = new Chess(fens[0]);
    for (const m of moves) game.move(m);
    const url = URL.createObjectURL(new Blob([game.pgn()], { type: "application/x-chess-pgn" }));
    const a = document.createElement("a");
    a.href = url; a.download = "cedar-review.pgn"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  byId<HTMLFormElement>("coach-form").addEventListener("submit", e => {
    e.preventDefault(); ask(byId<HTMLInputElement>("coach-question").value);
  });
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-question]"))
    b.addEventListener("click", () => ask(b.dataset.question || ""));
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-mode]"))
    b.addEventListener("click", () => {
      for (const button of root.querySelectorAll<HTMLButtonElement>("[data-mode]"))
        button.classList.toggle("active", button === b);
      reply(b.dataset.mode === "analyze"
        ? "Analysis mode selected. You can request Stockfish moves and inspect different continuations."
        : "Teaching mode selected. Let's focus on understanding the ideas behind each move.");
    });
  byId("coach-mic").addEventListener("click", () => {
    const w = window as Window & { SpeechRecognition?: RecognitionFactory; webkitSpeechRecognition?: RecognitionFactory };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { reply("This browser doesn't support voice recognition. Please type your question."); return; }
    try {
      recognition?.stop();
      recognition = new Ctor(); recognition.lang = "en-US";
      recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => ask(event.results[0]?.[0]?.transcript || "");
      recognition.onerror = () => reply("Microphone unavailable. Check permissions or type your question.");
      recognition.onend = () => { byId("coach-mic").classList.remove("recording"); };
      recognition.start();
      byId("coach-mic").classList.add("recording");
    } catch { reply("Couldn't start the microphone. Try typing instead."); }
  });
  const dispose = () => {
    if (dead) return;
    dead = true; recognition?.stop();
    window.speechSynthesis?.cancel();
    engine.dispose(); document.body.classList.remove("coach-mode");
  };
  byId("coach-back").addEventListener("click", () => { dispose(); onBack(); });
  renderChat(); renderBoard();
  return dispose;
}
