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

## Full chess moves, premoves, replay and match options

Cedar Chess uses `chess.js` for the full standard chess ruleset. Players can
play normal moves, captures, pawn double-steps, **en passant**, check, checkmate,
both castling sides, and all four promotions (queen, rook, bishop, knight).
Drawn chess positions (stalemate, threefold repetition, insufficient material,
fifty-/seventy-five-move rules) are recognized by the rules engine.

**Castling:** Clear the pieces between king and rook and make sure neither
the king's current square, travel squares nor destination are in check.
Select your king and tap **g1/g8** or **c1/c8**. You can also select the
king and tap the corner rook, the familiar Lichess-style gesture.
The rook moves automatically. Illegal castling is rejected.

**Premoves:** While Stockfish thinks, select one of your own pieces and its
destination. A queued premove shows distinct pink/red squares and can be
cancelled. When the AI finishes, Cedar revalidates the move against the
*actual new position*, automatically plays it only if legal, and otherwise
cancels it. Promotion premoves default to queen. Only one premove is stored
at a time; this cannot bypass chess rules or interfere with the AI clock.

**Replay & PGN:** Use **Moves & replay** to see standard algebraic move
notation (SAN), go to the opening/previous/next/latest position, and
return to live play. Reviewing never rewinds the actual match or stops
the 15+0 clock; it is view-only. Copy PGN or download a portable
`.pgn` game file from Settings. After a match, **Replay game** opens
the review controls.

**Player-facing board:** 2D on physical phones, original 3D GLB on laptops.
The board automatically faces your assigned pieces (Black on Impossible).
The camera does not unexpectedly move during a turn. **Settings → Flip board**
allows a manual override; desktop Settings also provides fixed 3D / Top
perspectives and deliberate zoom. No camera/Reset buttons occupy the
main two-button toolbar.

**In-game settings:** Legal move markers, highlight preferences,
coordinates, sound, premoves, move history, PGN, manual board flip,
and resign/leave confirmations. Preferences are stored locally in the
browser and do not expose account data. No leaderboard is created.

**End of game:** A focused popup provides **Play again**, **Replay game**,
**Match menu**, and **Save PGN**. Resignation records a game loss for the
human; its confirmation prevents accidental resignations. An in-progress
"leave game" also asks for confirmation.

Automated build regression tests cover legal/blocked castling, en
passant, promotions, candidate premoves, replay snapshots, PGN and
checkmate. Real-device QA remains useful for drag/tap comfort and the
GLB camera's framing.

## Device-aware chessboard and fixed 3D camera

- **Phones:** Cedar Chess uses the fast flat 2D board on the landing page and
  throughout a match. A phone requesting the browser's **Desktop site** mode
  still uses 2D chess and a vertically stacked layout; a wider fake viewport
  must not force it into a cramped pair of desktop columns.
- **Desktop/laptop:** The landing page uses the actual
  `public/wooden_chess_set.glb` wooden chess set via the same Three.js
  `ChessScene` renderer used for live games. This is not a CSS-transformed
  flat-board imitation. Opening moves are legal, validated by the same
  `ChessController`, and animate individual GLB chess pieces.
- **Camera stability:** Desktop games start at a fixed medium-high 3/4 perspective
  aimed at the full board. Orbit rotation, pan, mouse-wheel zoom, and camera
  damping are disabled during play so mouse/touch gestures cannot destabilize
  the angle while the clock runs. Use the explicit **3D View / Top View**
  buttons to choose between two locked perspectives. The existing zoom
  buttons remain available for deliberate framing changes.
- **Performance:** No WebGL scene is mounted on phones; the landing animation
  stops after its opening sequence instead of resetting or flashing the board.
  On changing screens, the GLB renderer and animation loop are disposed.
- **Accessibility:** Login and signup remain part of normal page flow, with
  readable contrast and no fixed bottom overlay hiding form controls.

## Rapid 15+0 match clock and adaptive search

Cedar Chess now uses the chess.com-style **15+0 rapid clock** in every
difficulty: **15 minutes for White and 15 minutes for Black**, with no
increment. A clock runs only while its side is to move; each player's
remaining time **carries forward** across moves and never resets after
one move. A promotion choice is part of that player's turn. Reset starts
a fresh 15+0 match; timeout ends the match and declares the other side
the winner on time. The UI and match HUD identify the 15+0 time control.

**Impossible** keeps Stockfish 19 as the authoritative decision-maker.
Its adaptive layer now budgets analysis according to:

- The bot's actual remaining time, with a reserve for future moves.
- The number of moves played so far and an estimated number still to play.
- Whether the position contains multiple forcing candidates (checks,
  captures, and promotions), where a deeper search is more valuable.
- The existing adaptive player-history factors, which modestly adjust
  the engine's base thinking time.

The GCP backend allows up to **15 seconds** of analysis by default.
Cedar Chess's authenticated Vercel engine proxy is now configured to
pass up to **12 seconds per search request**, with 15.5 seconds allowed
for network overhead and a 20-second function duration cap. The local
Stockfish 19 Lite WASM engine is similarly bounded at 12 seconds.
These remain *per-move search limits*, not 15 minutes of computation
for every move.

At the start of a 15+0 game Impossible typically budgets **9 seconds**
for quiet positions and **12 seconds** for tactically forcing ones.
It cuts that budget as its remaining 15-minute clock runs low. It
retains the best-ranked, single-PV Stockfish move; an LLM cannot
overrule the engine. Optional mate probes are skipped at low time.
The match HUD identifies which engine answered each AI move.

Longer GCP searches use additional Cloud Run CPU time and may increase
running costs. If the GCP server fails or times out, the browser
fallback can take additional time from the bot's same 15-minute clock.

The AI commentary providers explain the moves and may inform the time
allocation policy, but an LLM is not a replacement for Stockfish's
search/evaluation and cannot promise a zero-blunder game.

**Performance:** clock values are updated internally every animation
frame, but the expensive game HUD redraw now happens only when a
displayed second changes or the clock flags. This preserves more CPU
headroom for the local Stockfish WASM engine.

The goal of a 0.1%–0.5% loss rate remains **unverified**; it requires
hundreds or thousands of reproducible games against specified ratings,
with GCP and local fallback results reported separately.

## Impossible: deeper tactical and mating search

Impossible always requests a **single principal variation** (MultiPV 1), and
the decision layer is forced to take the engine's highest-ranked candidate,
rather than a random lower-ranked move or an LLM-selected alternative.

To make it stronger while preserving the live clock:

- Increase the requested engine depth cap from **30 to 36** (the engine may
  reach a lower actual depth within its time budget).
- Initially raised the engine budget from 2.4 to 4.5 seconds, and then
  expanded the 15+0 mode's dynamic search window up to **9–12 seconds**,
  with bounded transport overhead.
- Extend the opportunistic mating search from **mate 9 to mate 10** (plus
  bounded adaptive extension), with a **1.5-second** probe budget.
- If that preliminary mate probe fails or times out, the normal strongest-move
  search still runs. An unsuccessful mate probe must never forfeit an AI turn.
- Preserve GCP-first analysis and local Stockfish 19 Lite fallback, and keep
  the engine-source badge showing which backend answered the actual move.

These numbers are *search limits*, not guaranteed analyzed depth or a promise
to find every mate in 10 moves. Stockfish calculates the full set of legal
chess moves in each position and already handles the short opening mates
(Fool's Mate, Scholar's Mate, five-move variants), as well as forks, pins,
skewers, discovered checks, mating nets, and endgames. A hard-coded list
of traps would make Impossible more predictable rather than stronger.

The AI's search budget is finite and both sides use 15 minutes for the entire
match, so Impossible is intentionally extremely challenging but
**not mathematically unbeatable**.

## Difficulty ladder

- `Easy` — forgiving and light pressure.
- `Normal` — balanced and steady.
- `Hard` — sharp and consistent.
- `Boss Mode` — aggressive and punishing.
- `Nightmare Mode` — extremely strong with rank-1 engine selection.
- `Impossible` — the strongest mode. Stockfish uses the deepest current search budget, the AI begins as White, and both sides receive full 15-minute rapid clocks.

`Impossible` is the maximum-strength mode in the current app.

## Landing experience

The landing page now keeps chess itself at the center of the UI.

- Desktop shows an animated legal opening sequence on a chess board beside the match controls.
- Mobile uses a flat board as the main landing surface.
- Mobile and desktop expose chess-piece shortcut buttons for Player, Level/Access, and Play.
- The animation is powered by `chess.js`, so the demo sequence consists of legal moves rather than a decorative fake board.
- `prefers-reduced-motion` is respected.

## Player accounts and credential changes

Cedar Chess now has **Account settings** on the signed-in match menu. The settings page
lets players request an email change (with their current password) and change their
password (after validating the current password, with a minimum of eight characters).

- Sign-in accepts a **player name or email address**. Existing name-only accounts keep
  their legacy player-name login until their account email actually changes.
- New registrations can supply a personal email address (recommended). When used,
  sign in with **that email** rather than the player name. Supabase may require
  confirmation before the first login.
- Email changes are handled by `supabase.auth.updateUser`. The new email is not treated
  as active until Supabase completes its verification steps, and the player stays signed
  in while verification is pending.
- Changing a password verifies the existing password through Supabase Auth first.
  Passwords are never stored in the game database or sent to the AI / Stockfish routes.
- Existing accounts created with an inaccessible generated `@players.cedar-chess.app`
  address **may not be able to approve a secure email change at the old address**.
  If Supabase requires approvals at both addresses, the project owner must handle
  a secure migration of that legacy account. Do not turn off secure email change
  globally simply to make those accounts work.

**Deployment setup:** In Supabase Auth URL Configuration, allowlist the production
Cedar Chess origin as an Auth redirect URL so signup and email-change verification
links return to the app. Keep email confirmation and secure email-change protection
enabled. Password security settings are under Supabase Auth configuration; leaked
password protection may depend on the Supabase plan.

## Mobile landing, chess-piece navigation, and password recovery

The mobile home/login screens use a normal scrolling layout. The brand, heading,
legal opening demo, and sign-in/sign-up forms flow vertically rather than overlapping
or being covered by a fixed bottom panel. Fields and labels use a high-contrast dark
palette.

The chess-piece navigation is available before and after sign-in:

- **♚ Home** returns to the top-level page or the match menu.
- **♞ About** opens an on-page description of the chess modes and engine.
- **♜ Play** focuses access controls before sign-in, or starts a match after setup.
- **♛ Contact** opens an on-page contact/feedback section with a link to GitHub Issues.
- **♔ Access / Account** brings up sign-in controls or opens account settings.

These are real, accessible buttons; touch users may also swipe horizontally across
the navigation to switch to neighboring sections.

The opening demo uses a persistent 64-square board. Legal chess.js moves animate
the moving piece in its own layer rather than rebuilding the board, and the demo
stops at the end of the opening instead of abruptly resetting the entire board.

The login form has a **Forgot password?** link. It sends a Supabase Auth recovery
email to the address associated with an account. The email link returns to
`?reset-password=1`; only a Supabase `PASSWORD_RECOVERY` session event authorizes
the new-password form. After a successful reset the user signs in again.
Username-only legacy accounts with inaccessible generated email addresses cannot
receive recovery emails until a personal email is securely linked.

**Supabase configuration:** add the production Cedar Chess origin and its
`?reset-password=1` URL to the Auth URL Configuration redirect allowlist. Verify
the reset-password and change-email templates and SMTP delivery. The application
does not change email provider settings or passwords on users' behalf.

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


## Connected GCP Syzygy and shared-opponent learning

Cedar Chess can now consult the **exact Syzygy tablebase** already used by
the separate authenticated GCP chess backend. For standard positions with
seven or fewer pieces, the browser asks its authenticated Vercel engine proxy
to request `POST /api/tablebase` on GCP. When the lookup is exact and its
suggested UCI move passes a local chess.js legality check, that move
**takes precedence over heuristic Stockfish** because the endgame result
is solved, not estimated. The HUD shows `GCP · Syzygy Exact`.

If the backend has not yet deployed the tablebase route, the tablebase
provider is unavailable, or the result is unverified, Cedar seamlessly
continues with ordinary GCP Stockfish 19 and browser WASM fallback.

**Deployment order:** merge/deploy `MAVIS-creator/chess-mcp`'s tablebase
route before testing the Cedar frontend. It uses the existing Bearer
`MCP_AUTH_TOKEN` on the server and the existing authenticated
`/api/engine` proxy; no secrets or new `VITE_` variables are needed.

For learning across opponents, completed matches now optionally save up
to eight opening half-moves (UCI) beside the existing **player-owned**
`cedar_match_history` row. A restricted database trigger aggregates
four-, six- and eight-ply opening prefixes across accounts. Each account
counts at most once per opening prefix. The public aggregate can be read
by authenticated players only **after five distinct accounts** have
contributed to that prefix. No other player's identity or raw games
become accessible.

Impossible consults those anonymous aggregate statistics without blocking
the move. If a frequently seen opening has historically led to
human wins, the bot can add up to 20% to its bounded *search-time budget*.
**Stockfish still decides the move**; the learned statistics never
override objective evaluation. Shared statistics begin accumulating only
for newly completed games, so old match history without stored opening
moves cannot be reconstructed into the new aggregate.

The current GCP Cloud Run deployment template requests 2 vCPUs, 2 GiB
RAM, concurrency 1 and min instances 0. Under request-based billing,
the illustrative base compute cost is about $0.000477 for 9 s and
$0.000636 for 12 s, before free credits, cold starts and other costs.
An optional mate scan and tablebase lookup are separate requests.

## Premium mobile 2D board and visible engine status

The flat board uses the original inline SVG **Cedar Vector** piece set.
Each pawn, knight, bishop, rook, queen and king has crisp light/dark
outlines and scalable detail across high-DPI Android and iPhone screens.
No font fallback, remote sprite, or additional download is required.

- Soft ivory and olive square gradients, restrained golden board frame,
  tactile shadowing, board coordinates, more legible last-move highlights,
  selected squares and legal/capture markers.
- Buttons retain their keyboard/screen-reader labels. Artwork is only
  rewritten when a square's occupant changes; clock updates do not
  rebuild 32 SVG chess pieces every second.
- The 2D board is centered in the available vertical space above the
  bottom controls rather than leaving a disproportionately large gap
  under the board on tall phones.
- Engine provider labels are hidden from the match interface on both
  mobile and desktop to keep the screen focused on the clock and board.
  The engine source is still tracked internally for troubleshooting.
- An exact Syzygy result is only possible when the position contains
  **seven or fewer total chess pieces** and the authenticated GCP
  tablebase route responds. Normal opening positions always use Stockfish.

## Engine routing without on-screen labels

The game still records internally whether the most recent bot move came
from GCP Stockfish 19, the local Stockfish 19 Lite WASM fallback, or
an exact GCP Syzygy tablebase. The HUD deliberately **does not show**
engine-provider badges, per player preference.

The established GCP-first, browser-fallback, exact seven-piece Syzygy
routing remains unchanged. Both engines support legal chess moves,
including castling, en passant and promotions. MultiPV requests one
through five candidate lines depending on the difficulty.

## Stockfish licensing

The application code and Stockfish are separate works. Stockfish.js is distributed under GPL-3.0. The build script copies the upstream GPL notice and source metadata alongside the browser engine files. See `THIRD_PARTY_NOTICES.md` for the third-party notice.
