# Wooden Chess

A browser-based 3D chess experience built with Vite, TypeScript, Three.js, and `chess.js`, using the included `wooden_chess_set.glb` as the live board and piece scene.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser and play by clicking a piece, then clicking a highlighted destination square.

## Build

```bash
npm run build
```

## AI bot setup

The bot stack now uses:

- `chess.js` as the referee and legal move validator
- Stockfish as the candidate move engine
- an optional LLM provider as the personality-driven decision layer

Copy `.env.example` to `.env` and set only the provider you want to use.

```bash
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=your_key_here
```

Important:

- `VITE_` variables are exposed to the browser bundle
- for a real deployed product, move LLM calls behind a server-side proxy
- if any provider keys were pasted into chat or committed anywhere, rotate them immediately

## Current features

- Guided-orbit 3D camera around the wooden chess set
- Full chess rules powered by `chess.js`
- Click-to-select and click-to-move input
- Legal move highlighting and last-move feedback
- Castling, en passant, promotion, check, checkmate, stalemate, and draw-state handling
- Reset flow and status HUD
- AI bot difficulty modes, personalities, commentary, and Stockfish-backed move selection
