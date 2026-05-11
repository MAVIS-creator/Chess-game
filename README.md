# Cedar Chess

A browser-based 3D chess game built with Vite, TypeScript, Three.js, `chess.js`, Stockfish, and an optional LLM decision layer.

The game is designed so the board feels clean and readable, the moves stay fully legal, and the AI can feel more human without ever being allowed to invent illegal chess.

## Overview

Cedar Chess uses three separate layers:

- `chess.js` is the referee.
- Stockfish is the calculation engine.
- The optional LLM provider is the personality and commentary layer.

That separation matters:

- `chess.js` validates moves, enforces turns, and handles check, mate, castling, en passant, promotion, and draw states.
- Stockfish analyzes positions and produces strong candidate moves.
- The LLM never creates moves from scratch. It can only choose from Stockfish-approved candidates.

## Which Is Tougher?

If your goal is pure strength, **Stockfish is tougher than the AI provider**.

Use this rule of thumb:

- Stockfish = actual chess strength
- LLM provider = personality, style, commentary, and limited tie-breaking

So if you want the hardest possible bot:

1. Increase Stockfish strength first.
2. Keep the LLM tightly restricted.
3. In the hardest modes, let the LLM only decorate the move, not weaken it.

In the current app:

- `Nightmare Mode` is the closest thing to "maximum cruelty"
- `Boss Mode` is also very strong, but leaves a little more room for style
- `Hard` is competitive without being completely oppressive

## How The Hybrid AI Works

When the AI provider is enabled, the move flow is:

1. The player makes a move.
2. `chess.js` validates it.
3. Stockfish analyzes the current board.
4. Stockfish returns the best move plus extra candidate moves.
5. The app builds a safe candidate set.
6. The LLM receives only that candidate set.
7. The LLM chooses one move from that safe set.
8. `chess.js` validates the returned move again.
9. If anything is invalid, the app falls back to Stockfish rank 1.
10. The move animates on the board and commentary is shown.

This means:

- the engine stays strong
- the AI can still feel alive
- illegal hallucinated moves are rejected automatically

## What Happens When The AI Provider Is Off

If `VITE_AI_PROVIDER=disabled`, the game still works normally.

In that case:

- Stockfish still analyzes the position
- Stockfish still chooses the move
- `chess.js` still validates everything
- the LLM layer is skipped
- the app uses fallback commentary instead of provider-generated commentary

So with the provider turned off, the bot is still strong chess-wise. You only lose:

- AI personality flavor
- provider-generated taunts or commentary
- style-based tie-breaking between near-equal engine moves

You do **not** lose:

- legal chess
- move strength from Stockfish
- difficulty modes
- board animations
- turn handling

## Hardest Setup

For the strongest current setup:

1. Put a real provider in `.env`
2. Start the game
3. Choose `Nightmare Mode`

Recommended example:

```bash
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=your_key_here
VITE_GROQ_MODEL=llama-3.1-8b-instant
```

In the current build:

- `Nightmare Mode` uses the deepest engine settings
- the safe candidate set collapses very aggressively
- the LLM is mostly prevented from weakening the best engine move

So the hardest version is effectively:

**Stockfish first, AI flavor second**

## Difficulty Ladder

- `Easy`  
  Light pressure, more forgiving choices, softer play

- `Normal`  
  Balanced and steady

- `Hard`  
  Stronger engine pressure with fewer soft choices

- `Boss Mode`  
  Sharp, punishing, and dominant

- `Nightmare Mode`  
  The most ruthless setting in the current app

## Hidden Personality Mapping

The player only chooses difficulty in the menu, but internally each difficulty maps to a personality:

- `Easy` → `Soft Sparrow`
- `Normal` → `Quiet Mentor`
- `Hard` → `Iron Sentinel`
- `Boss Mode` → `Ivory Sovereign`
- `Nightmare Mode` → `Crimson Warlord`

These personalities mainly affect:

- short commentary
- move tone
- tie-breaking between close engine-approved lines

They do not override legality, and in the hardest modes they should not override strength either.

## Features

- 3D wooden chess board loaded from `wooden_chess_set.glb`
- Guided orbit camera
- Floating board presentation
- Menu-first match flow
- Player name entry before match start
- Difficulty selection before match start
- Turn HUD with AI thinking states
- Move and capture sounds
- Full chess rules through `chess.js`
- Stockfish-backed AI
- Optional LLM commentary layer
- Captured piece parking at the side of the board
- Promotion flow
- Reset support

## Project Structure

```text
src/
  ai/
    botDecisionLayer.ts
    botPersonality.ts
    botPrompts.ts
    botResponseParser.ts
  audio/
    chessSounds.ts
  engine/
    candidateMoves.ts
    deep-research-report.md
    stockfish.ts
  game/
    aiMoveController.ts
    ChessController.ts
    setup.ts
    types.ts
  render/
    boardLayout.ts
    ChessScene.ts
    modelRegistry.ts
  ui/
    Hud.ts
  main.ts
  styles.css
```

## Local Setup

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Environment Configuration

Copy `.env.example` to `.env`.

### Disable provider completely

```bash
VITE_AI_PROVIDER=disabled
```

### Use Groq

```bash
VITE_AI_PROVIDER=groq
VITE_GROQ_API_KEY=your_key_here
VITE_GROQ_MODEL=llama-3.1-8b-instant
```

### Use OpenRouter

```bash
VITE_AI_PROVIDER=openrouter
VITE_OPENROUTER_API_KEY=your_key_here
VITE_OPENROUTER_MODEL=openai/gpt-4o-mini
```

### Use Gemini

```bash
VITE_AI_PROVIDER=gemini
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-1.5-flash
```

## Important Security Note

`VITE_` environment variables are exposed to the browser bundle.

That means:

- browser users can inspect them
- they are not safe for long-term real production use
- a proper deployment should move provider calls behind a server-side proxy

If any real keys were pasted into chat, source control, screenshots, or shared files, rotate them.

## Recommended Practical Strategy

If you want the game to feel hard and premium:

- Use Stockfish as the real brain
- Keep the provider on a short leash
- Let the provider add personality, not chess chaos
- Use `Nightmare Mode` for the strongest experience

If you want the simplest safe setup:

- leave the provider disabled
- keep Stockfish enabled
- rely on fallback commentary

That setup is still strong, stable, and much easier to ship safely.

## Troubleshooting

### The AI is not using the provider

Check:

- `.env` exists
- `VITE_AI_PROVIDER` is not `disabled`
- the selected provider key is present
- you restarted the dev server after editing `.env`

### The bot still feels too easy

Use:

- `Nightmare Mode`
- provider enabled
- latest tightened safe-set logic

Remember: the LLM should not make the bot stronger than Stockfish. It should only make the bot feel more human while staying near engine strength.

### The bot talks but does not seem stronger

That usually means the provider is adding flavor, but Stockfish settings are still the main strength limit. Increase engine difficulty before expecting commentary logic to create a stronger opponent.

### Build warning about chunk size

The current project may warn about large bundles during `vite build`. That warning does not stop the build. If needed later, the app can be code-split further.

## Research Basis

The AI hardening direction in this project is informed by:

- [src/engine/deep-research-report.md](C:\xampp\htdocs\Chess game\src\engine\deep-research-report.md)

The key principle from that research is simple:

**never let the LLM outrank the engine**
