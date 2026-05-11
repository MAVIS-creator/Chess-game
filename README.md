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

## Current features

- Guided-orbit 3D camera around the wooden chess set
- Full chess rules powered by `chess.js`
- Click-to-select and click-to-move input
- Legal move highlighting and last-move feedback
- Castling, en passant, promotion, check, checkmate, stalemate, and draw-state handling
- Reset flow and status HUD
