import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { ChessController } from "../src/game/ChessController";

const play = (game: ChessController, ...moves: string[]) => {
  for (const move of moves) assert.equal(game.applyUciMove(move), true, `Expected legal move ${move}`);
};
const pieceAt = (game: ChessController, square: string) =>
  game.getSnapshot().pieces.find(piece => !piece.captured && piece.square === square);

// Standard kingside castling.
const white = new ChessController();
play(white, "e2e4", "a7a6", "g1f3", "a6a5", "f1e2", "b7b6");
assert.equal(white.hasLegalMove("e1", "g1"), true);
assert.equal(white.selectSquare("e1"), false);
assert.equal(white.selectSquare("h1"), true, "King-on-rook gesture should castle");
assert.equal(pieceAt(white, "g1")?.role, "king");
assert.equal(pieceAt(white, "f1")?.role, "rook");
assert.equal(white.getMoveHistory().at(-1)?.san, "O-O");
assert.equal(white.getPgn().includes("O-O"), true);

// Queenside castle: king from e1 to c1 and rook from a1 to d1.
const queenside = new ChessController();
play(queenside, "d2d4", "a7a6", "b1c3", "a6a5", "c1f4", "b7b6", "d1d2", "b6b5");
assert.equal(queenside.hasLegalMove("e1", "c1"), true);
assert.equal(queenside.selectSquare("e1"), false);
assert.equal(queenside.selectSquare("a1"), true);
assert.equal(pieceAt(queenside, "c1")?.role, "king");
assert.equal(pieceAt(queenside, "d1")?.role, "rook");
assert.equal(queenside.getMoveHistory().at(-1)?.san, "O-O-O");

// A castle is illegal while pieces block the king, even using king-on-rook.
const blocked = new ChessController();
assert.equal(blocked.selectSquare("e1"), false);
assert.equal(blocked.selectSquare("h1"), false);
assert.equal(blocked.getSnapshot().moveCount, 0);
assert.equal(blocked.applyUciMove("e1g1"), false, "Invalid UCI cannot crash the game");

// En passant removes the bypassed pawn, not a piece at the arrival square.
const enPassant = new ChessController();
play(enPassant, "e2e4", "a7a6", "e4e5", "d7d5", "e5d6");
assert.equal(pieceAt(enPassant, "d6")?.color, "white");
assert.equal(pieceAt(enPassant, "d5"), undefined);
assert.equal(enPassant.getMoveHistory().at(-1)?.san, "exd6");

// One premove is prepared on the opposite turn; it must later be legal.
const premove = new ChessController();
assert.equal(premove.getPremoveTargets("e7", "black").includes("e5"), true);
assert.deepEqual(premove.getPremoveTargets("e2", "white"), []);
play(premove, "e2e4");
assert.equal(premove.getPremoveTargets("g1", "white").includes("f3"), true);
play(premove, "a7a6");
assert.equal(premove.hasLegalMove("g1", "f3"), true);
play(premove, "g1f3");

// Replaying historical plies never mutates the real position.
const before = enPassant.getFen();
const start = enPassant.getReplaySnapshot(0);
assert.equal(start.moveCount, 0);
assert.equal(start.pieces.filter(p=>!p.captured).length,32);
const mid = enPassant.getReplaySnapshot(3);
assert.equal(mid.moveCount, 3);
assert.equal(enPassant.getReplaySnapshot(99).moveCount, 5);
assert.equal(enPassant.getFen(), before);

// All four promotions and legal chess endings remain delegated to chess.js.
for (const role of ["q", "r", "b", "n"]) {
  const game = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
  const move = game.move({from:"a7",to:"a8",promotion:role});
  assert.equal(move.promotion,role);
}
const fool = new Chess();
for (const san of ["f3","e5","g4","Qh4#"]) fool.move(san);
assert.equal(fool.isCheckmate(),true);

console.log("Chess control regression tests: castling, en passant, promotions, premoves, replay, checkmate passed.");
