# Cedar Chess

Cedar Chess is a browser-based chess game built with Vite, TypeScript, Three.js, `chess.js`, Supabase, and Stockfish 19.

The current architecture is designed around one rule: **the game must keep working even when cloud services do not**.

## Engine architecture

```text
Player move
   |
   v
chess.js legality
   |
   v
Vercel /api/engine (authenticated)
   |
   +---- available ----> GCP chess-mcp /api/analyze -> Stockfish 19
   |
   +---- unavailable --> local browser Stockfish 19 lite-single
   |
   v
chess.js validates the chosen move again
```

The GCP engine is preferred because it can use the stronger hosted Stockfish service. If GCP is unavailable, expired, times out, or is not configured, the game automatically falls back to the local Stockfish 19 WASM worker.

The fallback is generated from the pinned `stockfish@19.0.1` npm package during local development and production builds.

## Difficulty ladder

- `Easy` — forgiving and light pressure.
- `Normal` — balanced and steady.
- `Hard` — sharp and consistent.
- `Boss Mode` — aggressive and punishing.
- `Nightmare Mode` — extremely strong with rank-1 engine selection.
- `Impossible` — the strongest mode. Stockfish uses the deepest current search budget, the AI begins as White, and the clocks are intentionally brutal.

`Impossible` is the maximum-strength mode in the current app.

## Landing experience

The landing page now keeps chess itself at the center of the UI.

- Desktop shows an animated legal opening sequence on a chess board beside the match controls.
- Mobile uses a flat board as the main landing surface.
- Mobile and desktop expose chess-piece shortcut buttons for Player, Level/Access, and Play.
- The animation is powered by `chess.js`, so the demo sequence consists of legal moves rather than a decorative fake board.
- `prefers-reduced-motion` is respected.

## Security model

### Provider keys

Groq, OpenRouter, and Gemini API keys are no longer read by browser code.

The existing Vercel environment-variable names are intentionally unchanged:

```text
VITE_AI_PROVIDER
VITE_GROQ_API_KEY
VITE_GROQ_MODEL
VITE_OPENROUTER_API_KEY
VITE_OPENROUTER_MODEL
VITE_GEMINI_API_KEY
VITE_GEMINI_MODEL
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The provider secret values are now read only by the Vercel `/api/ai` server function. Keeping the names means an existing Vercel project can reuse its current environment configuration without renaming variables.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` remain client-visible because they are Supabase publishable values; authorization is enforced by Supabase Auth and RLS.

### API authentication

Both `/api/ai` and `/api/engine` require a valid Cedar Chess Supabase session. The server verifies the session against Supabase before proxying expensive provider or engine requests.

The API layer also applies bounded in-memory rate limiting and same-origin checks. These are defense-in-depth controls; Vercel or another edge rate-limit product can be added later for globally shared limits.

### GCP engine secret

The Cloud Run bearer token is never exposed to the browser.

Add the following server-only variables in Vercel:

```text
MCP_AUTH_TOKEN=the same token used by the chess-mcp Cloud Run service
CHESS_MCP_URL=https://chatgpt-stockfish-567370443508.us-central1.run.app
```

`CHESS_MCP_URL` is optional because the current service URL is already the code default. `MCP_AUTH_TOKEN` is required for cloud analysis.

If the token or GCP service is unavailable, Cedar Chess falls back to local Stockfish 19 automatically.

## Supabase RLS hardening

The old schema allowed anonymous/global access to adaptive profiles and match history. The repository now contains a migration that changes access to per-user policies:

```text
supabase/migrations/20261103_harden_rls.sql
```

Apply that migration to the live Supabase project before treating the production database as hardened.

After the migration:

- anonymous users cannot read or write AI profiles;
- authenticated players can only read/write the profile whose `profile_key` equals their own Supabase user ID;
- authenticated players can only insert/read their own match-history rows;
- adaptive profiles are stored per player instead of in one public `global` row.

## AI commentary layer

The LLM layer is optional. Provider requests now go through `/api/ai` and never receive provider keys in the client bundle.

The chess engine remains authoritative:

- `chess.js` enforces legality;
- Stockfish ranks moves;
- hardest modes force the engine's first candidate;
- any LLM-selected move is checked against the engine-approved candidate set;
- invalid output falls back safely.

The game continues to work if every LLM provider is disabled or unavailable.

## Project structure

```text
api/
  _auth.js              authenticated API guard + bounded rate limiting
  ai.js                 server-side Groq/OpenRouter/Gemini proxy
  engine.js             authenticated GCP Stockfish proxy
src/
  ai/
    adaptiveProfile.ts
    botDecisionLayer.ts
    botPersonality.ts
    botPrompts.ts
    botResponseParser.ts
  auth/
    apiSession.ts
    playerAuth.ts
    supabase.ts
  audio/
    chessSounds.ts
  engine/
    candidateMoves.ts
    stockfish.ts         GCP-first + local Stockfish 19 fallback
  game/
    aiMoveController.ts
    ChessController.ts
    setup.ts
    types.ts
  render/
    ChessScene.ts
    FlatChessBoard.ts
  ui/
    Hud.ts
    landingEnhancer.ts
  landing.css
  main.ts
scripts/
  sync-stockfish.mjs
supabase/
  schema.sql
  migrations/
    20261103_harden_rls.sql
```

## Local setup

```bash
npm install
npm run dev
```

`npm run dev` automatically copies the pinned Stockfish 19 lite-single browser build into `public/stockfish` before Vite starts.

Production build:

```bash
npm run build
```

The production build performs the same Stockfish 19 asset sync before TypeScript and Vite run.

## Vercel deployment

1. Keep the existing `VITE_*` environment-variable names already configured in Vercel.
2. Add `MCP_AUTH_TOKEN` with the existing Cloud Run MCP token.
3. Optionally set `CHESS_MCP_URL` if the Cloud Run URL ever changes.
4. Apply the Supabase RLS migration to the live Supabase project.
5. Deploy normally.

Security headers are defined in `vercel.json`, including CSP, clickjacking protection, content-type hardening, restricted browser permissions, and no-store behavior for API responses.

## Stockfish licensing

The application code and Stockfish are separate works. Stockfish.js is distributed under GPL-3.0. The build script copies the upstream GPL notice and source metadata alongside the browser engine files. See `THIRD_PARTY_NOTICES.md` for the third-party notice.
