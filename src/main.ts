import "./styles.css";
import { changeAccountEmail, changeAccountPassword, getAccountDetails } from "./auth/accountSettings";
import {
  getCurrentPlayer,
  completePlayerPasswordReset,
  requestPlayerPasswordReset,
  onPlayerSessionChange,
  signInPlayer,
  signOutPlayer,
  signUpPlayer,
  type PlayerIdentity
} from "./auth/playerAuth";
import {
  BOT_DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_CONFIG,
  getPersonalityForDifficulty,
  type BotDifficulty
} from "./ai/botPersonality";
import { ChessSoundboard } from "./audio/chessSounds";
import { AiMoveController } from "./game/aiMoveController";
import { ChessController } from "./game/ChessController";
import type { GamePieceState, MoveSummary, PieceColor, PieceRole, SquareId } from "./game/types";
import { ChessScene } from "./render/ChessScene";
import { FlatChessBoard } from "./render/FlatChessBoard";
import { Hud, type BoardPreferences } from "./ui/Hud";
import { isMobileChessDevice } from "./ui/deviceLayout";

declare global {
  interface Window {
    __WOODEN_CHESS_DEBUG__?: {
      controller: ChessController;
      aiController: AiMoveController;
      sync: () => void;
      syncAndRunBotTurn: () => Promise<void>;
    };
  }
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

const soundboard = new ChessSoundboard();
let selectedDifficulty: BotDifficulty = DEFAULT_DIFFICULTY;
let playerName = "";
let activePlayer: PlayerIdentity | null = null;
const searchParams = new URLSearchParams(window.location.search);
let activeSessionCleanup: (() => void) | null = null;
let authListenerCleanup: (() => void) | null = null;
let authMode: "login" | "signup" = "login";
let authError = "";
let authNotice = "";
let passwordRecoveryAuthorized = false;

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const renderAuth = () => {
  activeSessionCleanup?.();
  activeSessionCleanup = null;
  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell auth-shell">
      <section class="menu-hero auth-hero">
        <div class="brand-mark" aria-hidden="true">
          <div class="brand-emblem">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="brand-copy">
            <p class="eyebrow">Cedar Chess</p>
            <strong>Player Access</strong>
          </div>
        </div>
        <h1>Sign in before the board opens.</h1>
        <p class="lede">
          Use your player name or linked email and password to open the board and start a match.
        </p>
        <div class="menu-notes">
          <div class="menu-chip"><span>Login</span><strong>Name or email + password</strong></div>
          <div class="menu-chip"><span>Modes</span><strong>Choose your challenge</strong></div>
          <div class="menu-chip"><span>Match</span><strong>Board opens right after setup</strong></div>
        </div>
      </section>
      <aside class="menu-panel auth-panel">
        <div class="hero-status">
          <span class="hero-label">${authMode === "login" ? "Welcome back" : "Create account"}</span>
          <strong>${authMode === "login" ? "Log in to continue." : "Claim your player profile."}</strong>
          <p>${authMode === "login" ? "Enter your details and continue to the match menu." : "Create your login once, then come back anytime and start a new match."}</p>
        </div>
        <div class="auth-switch">
          <button class="auth-switch-button ${authMode === "login" ? "is-active" : ""}" type="button" data-auth-mode="login">Login</button>
          <button class="auth-switch-button ${authMode === "signup" ? "is-active" : ""}" type="button" data-auth-mode="signup">Sign up</button>
        </div>
        <label class="select-block">
          <span>${authMode === "login" ? "Player name or email" : "Player name"}</span>
          <input id="auth-player-name" class="menu-input" type="text" maxlength="254" autocomplete="username" placeholder="${authMode === "login" ? "Name or email" : "Your name"}" value="${escapeHtml(playerName)}" />
        </label>
        ${authMode === "signup" ? `
          <label class="select-block">
            <span>Personal email (recommended)</span>
            <input id="auth-email" class="menu-input" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" />
            <small class="account-note">Use a real email to verify and recover your account. Sign in with this email afterwards.</small>
          </label>
        ` : ""}
        <label class="select-block">
          <span>Password</span>
          <input id="auth-password" class="menu-input" type="password" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" minlength="${authMode === "signup" ? 8 : 6}" placeholder="Enter your password" />
        </label>
        ${authMode === "login" ? '<button class="account-link-button auth-forgot-link" id="auth-forgot" type="button">Forgot password?</button>' : ""}
        ${authError ? `<p class="auth-error" role="alert">${escapeHtml(authError)}</p>` : ""}
        ${authNotice ? `<p class="account-message is-success" role="status">${escapeHtml(authNotice)}</p>` : ""}
        <button class="start-button" id="auth-submit" type="button">${authMode === "login" ? "Enter game" : "Create account"}</button>
      </aside>
    </main>
  `;

  const nameInput = document.querySelector<HTMLInputElement>("#auth-player-name");
  const passwordInput = document.querySelector<HTMLInputElement>("#auth-password");
  const submitButton = document.querySelector<HTMLButtonElement>("#auth-submit");
  const modeButtons = document.querySelectorAll<HTMLButtonElement>("[data-auth-mode]");

  nameInput?.addEventListener("input", () => {
    playerName = nameInput.value.trim();
  });

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      authMode = button.dataset.authMode === "signup" ? "signup" : "login";
      authError = "";
      authNotice = "";
      renderAuth();
    });
  }

  document.querySelector<HTMLButtonElement>("#auth-forgot")?.addEventListener("click", renderForgotPassword);

  submitButton?.addEventListener("click", async () => {
    const username = nameInput?.value.trim() || "";
    const password = passwordInput?.value ?? "";

    if (!username || password.length < (authMode === "signup" ? 8 : 6)) {
      authError = `Enter a name/email and a password with at least ${authMode === "signup" ? 8 : 6} characters.`;
      renderAuth();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = authMode === "login" ? "Checking..." : "Creating...";

    try {
      const signedInPlayer =
        authMode === "login"
          ? await signInPlayer(username, password)
          : await signUpPlayer(username, password, document.querySelector<HTMLInputElement>("#auth-email")?.value ?? "");
      if (!signedInPlayer) {
        authMode = "login";
        authError = "";
        authNotice = "Account created. Check your email for a confirmation link before signing in.";
        renderAuth();
        return;
      }
      activePlayer = signedInPlayer;
      authError = "";
      authNotice = "";
      playerName = activePlayer.displayName;
      renderMenu();
    } catch (error) {
      authError = error instanceof Error ? error.message : "Authentication failed.";
      renderAuth();
    }
  });
};

const renderForgotPassword = () => {
  activeSessionCleanup?.();
  activeSessionCleanup = null;
  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell auth-shell recovery-shell">
      <section class="menu-hero auth-hero">
        <div class="brand-mark"><div class="brand-emblem" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="brand-copy"><p class="eyebrow">Cedar Chess</p><strong>Password recovery</strong></div></div>
        <h1>Recover your player account.</h1>
        <p class="lede">We'll email you a secure link to set a new password. You must have access to your registered personal inbox.</p>
      </section>
      <aside class="menu-panel auth-panel recovery-panel">
        <div class="hero-status">
          <span class="hero-label">Forgot password?</span>
          <strong>Reset it by email</strong>
          <p>Enter the real email address linked to your account. A player name or placeholder email cannot receive a recovery message.</p>
        </div>
        <form id="forgot-password-form" class="account-form">
          <label class="select-block"><span>Account email</span>
            <input id="recovery-email" class="menu-input" type="email" maxlength="254" placeholder="you@example.com" autocomplete="email" required />
          </label>
          <p class="account-message" id="recovery-request-status" role="status" aria-live="polite"></p>
          <button class="start-button" type="submit">Email me a reset link</button>
        </form>
        <p class="account-note">Existing name-only accounts without a verified personal email need account support to recover access.</p>
        <button class="account-link-button" id="recovery-back" type="button">← Back to login</button>
      </aside>
    </main>
  `;

  document.querySelector<HTMLButtonElement>("#recovery-back")?.addEventListener("click", () => {
    window.history.replaceState(null, "", window.location.pathname);
    renderAuth();
  });
  document.querySelector<HTMLFormElement>("#forgot-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>("#recovery-email")?.value ?? "";
    const status = document.querySelector<HTMLElement>("#recovery-request-status");
    const button = document.querySelector<HTMLButtonElement>("#forgot-password-form button[type=submit]");
    if (button) button.disabled = true;
    if (status) {
      status.textContent = "";
      status.classList.remove("is-success");
    }
    try {
      await requestPlayerPasswordReset(email);
      if (status) {
        status.textContent = "If this address belongs to a Cedar Chess account, a reset email will arrive shortly. Check your inbox and spam folder.";
        status.classList.add("is-success");
      }
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Unable to request a reset link.";
    } finally {
      if (button) button.disabled = false;
    }
  });
};

const renderPasswordRecovery = () => {
  // Only PASSWORD_RECOVERY from Supabase Auth grants access to this screen.
  // The query parameter by itself must never authorize a password change.
  if (!passwordRecoveryAuthorized || !activePlayer) {
    renderForgotPassword();
    return;
  }
  activeSessionCleanup?.();
  activeSessionCleanup = null;
  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell auth-shell recovery-shell">
      <section class="menu-hero auth-hero">
        <div class="brand-mark"><div class="brand-emblem" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="brand-copy"><p class="eyebrow">Cedar Chess</p><strong>New password</strong></div></div>
        <h1>Secure your next match.</h1>
        <p class="lede">Your recovery link has been verified. Choose a fresh password for your Cedar Chess account.</p>
      </section>
      <aside class="menu-panel auth-panel recovery-panel">
        <div class="hero-status">
          <span class="hero-label">Verified recovery link</span>
          <strong>Set a new password</strong>
          <p>Use at least eight characters. You will sign in again with the new password afterwards.</p>
        </div>
        <form id="finish-recovery-form" class="account-form">
          <label class="select-block"><span>New password</span>
            <input id="recovery-new-password" class="menu-input" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <label class="select-block"><span>Confirm password</span>
            <input id="recovery-confirm-password" class="menu-input" type="password" minlength="8" autocomplete="new-password" required />
          </label>
          <p class="account-message" id="recovery-finish-status" role="status" aria-live="polite"></p>
          <button class="start-button" type="submit">Save new password</button>
        </form>
      </aside>
    </main>
  `;

  document.querySelector<HTMLFormElement>("#finish-recovery-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordRecoveryAuthorized) return;
    const password = document.querySelector<HTMLInputElement>("#recovery-new-password")?.value ?? "";
    const confirm = document.querySelector<HTMLInputElement>("#recovery-confirm-password")?.value ?? "";
    const status = document.querySelector<HTMLElement>("#recovery-finish-status");
    const button = document.querySelector<HTMLButtonElement>("#finish-recovery-form button[type=submit]");
    if (password !== confirm) {
      if (status) status.textContent = "Passwords must match.";
      return;
    }
    if (button) button.disabled = true;
    try {
      await completePlayerPasswordReset(password);
      passwordRecoveryAuthorized = false;
      await signOutPlayer();
      activePlayer = null;
      playerName = "";
      authMode = "login";
      authError = "";
      authNotice = "Password changed successfully. Sign in using your new password.";
      window.history.replaceState(null, "", window.location.pathname);
      renderAuth();
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : "Password reset failed.";
      if (button) button.disabled = false;
    }
  });
};

const renderMenu = () => {
  activeSessionCleanup?.();
  activeSessionCleanup = null;
  if (!activePlayer) {
    renderAuth();
    return;
  }
  playerName = activePlayer.displayName;
  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell">
      <section class="menu-hero">
        <div class="brand-mark" aria-hidden="true">
          <div class="brand-emblem">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div class="brand-copy">
          <p class="eyebrow">Cedar Chess</p>
            <strong>${escapeHtml(activePlayer.displayName)}</strong>
          </div>
        </div>
        <h1>A clean wooden chess table, a focused match, and a strong AI opponent.</h1>
        <p class="lede">
          Start from a simple match menu, choose your name and difficulty, then step straight into
          the board. The game keeps the screen calm, the moves legal, and the match easy to read.
        </p>
        <div class="menu-notes">
          <div class="menu-chip"><span>Board</span><strong>Floating 3D wooden set</strong></div>
          <div class="menu-chip"><span>Audio</span><strong>Classic move and capture sounds</strong></div>
          <div class="menu-chip"><span>Opponent</span><strong>Single-player vs AI</strong></div>
        </div>
        <div class="hero-footnote">
          <div class="hero-status compact">
            <span class="hero-label">How it plays</span>
            <strong>Click a piece, then click its highlighted destination.</strong>
          </div>
          <div class="hero-status compact">
            <span class="hero-label">During the match</span>
            <strong>Captured pieces slide to the board edge and stay visible.</strong>
          </div>
        </div>
      </section>
      <aside class="menu-panel">
        <div class="hero-status">
          <span class="hero-label">Match setup</span>
          <strong>Set the match once, then go straight into play.</strong>
          <p>Set your difficulty here, then head straight into the match.</p>
        </div>
        <label class="select-block">
          <span>Name</span>
          <input id="menu-player-name" class="menu-input" type="text" maxlength="20" placeholder="Name" value="${escapeHtml(playerName)}" />
        </label>
        <label class="select-block">
          <span>Difficulty</span>
          <select id="menu-difficulty">
            ${BOT_DIFFICULTIES.map(
              (difficulty) =>
                `<option value="${difficulty}" ${difficulty === selectedDifficulty ? "selected" : ""}>${difficulty}</option>`
            ).join("")}
          </select>
        </label>
        <div class="difficulty-note">
          <span>Current challenge</span>
          <strong>${selectedDifficulty}</strong>
          <p>${difficultyDescription(selectedDifficulty)}</p>
        </div>
        <div class="hero-status compact">
          <span class="hero-label">Game clock · 15+0 rapid</span>
          <strong>15:00 per player, for the whole game</strong>
          <p>Each clock counts down only while that side is to move. No reset after each move and no increment.</p>
        </div>
        <button class="start-button" id="start-match" type="button">Start game</button>
        <button class="account-link-button" id="open-account-settings" type="button">♔ Account settings · Change email or password</button>
      </aside>
    </main>
  `;

  const difficultySelect = document.querySelector<HTMLSelectElement>("#menu-difficulty");
  const playerNameInput = document.querySelector<HTMLInputElement>("#menu-player-name");
  const difficultyNote = document.querySelector<HTMLElement>(".difficulty-note");
  const startButton = document.querySelector<HTMLButtonElement>("#start-match");

  difficultySelect?.addEventListener("change", () => {
    selectedDifficulty = difficultySelect.value as BotDifficulty;
    if (difficultyNote) {
      difficultyNote.innerHTML = `
        <span>Current challenge</span>
        <strong>${selectedDifficulty}</strong>
        <p>${difficultyDescription(selectedDifficulty)}</p>
      `;
    }
  });

  playerNameInput?.addEventListener("input", () => {
    playerName = playerNameInput.value.trim();
  });

  document.querySelector<HTMLButtonElement>("#open-account-settings")?.addEventListener("click", () => {
    void renderAccountSettings();
  });

  startButton?.addEventListener("click", () => {
    playerName = playerNameInput?.value.trim() || activePlayer?.displayName || "Guest";
    soundboard.prime();
    void startGame();
  });
};

const renderAccountSettings = async () => {
  activeSessionCleanup?.();
  activeSessionCleanup = null;
  const accountId = activePlayer?.id;
  if (!accountId) {
    renderAuth();
    return;
  }

  let details: Awaited<ReturnType<typeof getAccountDetails>>;
  try {
    details = await getAccountDetails();
  } catch {
    renderAuth();
    return;
  }
  if (!activePlayer || activePlayer.id !== accountId) {
    return;
  }

  document.body.classList.remove("game-mode");
  app.innerHTML = `
    <main class="menu-shell account-shell">
      <section class="menu-hero account-hero">
        <div class="brand-mark"><div class="brand-copy"><p class="eyebrow">Cedar Chess</p><strong>Account security</strong></div></div>
        <h1>Make your next move secure.</h1>
        <p class="lede">Manage the login details for <strong>${escapeHtml(activePlayer.displayName)}</strong> without leaving Cedar Chess.</p>
        <div class="hero-status account-overview">
          <span class="hero-label">Current email</span>
          <strong id="account-email-display"></strong>
          <p>${details.hasPersonalEmail ? "Email updates may require confirmation at your old and new addresses." : "This is a legacy player-name account. Linking a personal email may require verification at the original placeholder address, depending on your Supabase settings."}</p>
        </div>
        <button class="account-link-button account-back" id="account-back" type="button">← Back to match menu</button>
      </section>
      <aside class="menu-panel account-panel">
        <div class="hero-status compact">
          <span class="hero-label">Email address</span>
          <strong>Change your login email</strong>
          <p>Verify your current password. Your new email may need confirmation before it takes effect. Once changed, sign in with your new email.</p>
        </div>
        <form class="account-form" id="change-email-form">
          <label class="select-block"><span>New email</span><input class="menu-input" id="settings-new-email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required /></label>
          <label class="select-block"><span>Current password</span><input class="menu-input" id="settings-email-password" type="password" autocomplete="current-password" required /></label>
          <p class="account-message" id="email-change-status" role="status" aria-live="polite"></p>
          <button class="start-button" type="submit">Update email</button>
        </form>
        <div class="hero-status compact">
          <span class="hero-label">Password</span>
          <strong>Choose a new password</strong>
          <p>Enter your current password, then a new password with at least eight characters.</p>
        </div>
        <form class="account-form" id="change-password-form">
          <label class="select-block"><span>Current password</span><input class="menu-input" id="settings-old-password" type="password" autocomplete="current-password" required /></label>
          <label class="select-block"><span>New password</span><input class="menu-input" id="settings-new-password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <label class="select-block"><span>Confirm new password</span><input class="menu-input" id="settings-confirm-password" type="password" minlength="8" autocomplete="new-password" required /></label>
          <p class="account-message" id="password-change-status" role="status" aria-live="polite"></p>
          <button class="start-button" type="submit">Update password</button>
        </form>
      </aside>
    </main>
  `;

  const emailDisplay = document.querySelector<HTMLElement>("#account-email-display");
  if (emailDisplay) {
    emailDisplay.textContent = details.hasPersonalEmail ? details.email : "No personal email linked";
  }
  document.querySelector<HTMLButtonElement>("#account-back")?.addEventListener("click", renderMenu);
  const report = (id: string, message: string, success: boolean) => {
    const status = document.getElementById(id);
    if (status) {
      status.textContent = message;
      status.classList.toggle("is-success", success);
    }
  };

  document.querySelector<HTMLFormElement>("#change-email-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>("#settings-new-email")?.value ?? "";
    const currentPassword = document.querySelector<HTMLInputElement>("#settings-email-password")?.value ?? "";
    const button = document.querySelector<HTMLButtonElement>("#change-email-form button[type=submit]");
    if (button) button.disabled = true;
    report("email-change-status", "", false);
    try {
      await changeAccountEmail(email, currentPassword);
      report("email-change-status", "Request sent. Follow the verification instructions in your email. Your current address remains active until the change is approved.", true);
      const passwordField = document.querySelector<HTMLInputElement>("#settings-email-password");
      if (passwordField) passwordField.value = "";
    } catch (error) {
      report("email-change-status", error instanceof Error ? error.message : "Could not update email.", false);
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.querySelector<HTMLFormElement>("#change-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const oldPassword = document.querySelector<HTMLInputElement>("#settings-old-password")?.value ?? "";
    const newPassword = document.querySelector<HTMLInputElement>("#settings-new-password")?.value ?? "";
    const confirmation = document.querySelector<HTMLInputElement>("#settings-confirm-password")?.value ?? "";
    if (newPassword !== confirmation) {
      report("password-change-status", "The new passwords do not match.", false);
      return;
    }
    const button = document.querySelector<HTMLButtonElement>("#change-password-form button[type=submit]");
    if (button) button.disabled = true;
    report("password-change-status", "", false);
    try {
      await changeAccountPassword(oldPassword, newPassword);
      document.querySelector<HTMLFormElement>("#change-password-form")?.reset();
      report("password-change-status", "Password updated successfully.", true);
    } catch (error) {
      report("password-change-status", error instanceof Error ? error.message : "Could not change password.", false);
    } finally {
      if (button) button.disabled = false;
    }
  });
};

const difficultyDescription = (difficulty: BotDifficulty) => {
  switch (difficulty) {
    case "Easy":
      return "Very forgiving and light pressure.";
    case "Normal":
      return "Balanced and solid.";
    case "Hard":
      return "Sharper and more consistent.";
    case "Boss Mode":
      return "Strong, aggressive, and punishing.";
    case "Nightmare Mode":
      return "Extremely hard with heavy tactical pressure.";
    case "Impossible":
      return "Final boss chess. The AI starts as White; both sides have a full 15-minute rapid clock.";
  }
};

type BoardRenderer = {
  loadScene: () => Promise<{ pieceCount: number; squareCount: number }>;
  setSquareSelectHandler: (handler: (square: SquareId) => void) => void;
  syncBoardState: (pieces: GamePieceState[], animateMove: MoveSummary | null) => void;
  highlightSquares: (
    selected: SquareId | null,
    legalTargets: SquareId[],
    captureTargets: SquareId[],
    lastMove: MoveSummary | null,
    checkedKingSquare?: SquareId | null
  ) => void;
  cycleCameraPreset: (lastMove: MoveSummary | null) => void;
  flipBoard?: () => void;
  setCameraPreset?: (preset: "perspective" | "top-down") => void;
  setPlayerColor?: (color: PieceColor) => void;
  setPremoveHighlights?: (from: SquareId | null, to: SquareId | null) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  dispose: () => void;
};

const pieceColorLabel = (color: PieceColor) => (color === "white" ? "White" : "Black");

const winnerLabel = (winner: "player" | "ai", playerNameValue: string, color: PieceColor) =>
  winner === "player" ? `${playerNameValue} (${pieceColorLabel(color)})` : `AI (${pieceColorLabel(color)})`;

const formatMatchHistoryStatus = (
  statusText: string,
  playerNameValue: string,
  playerColorValue: PieceColor,
  botColorValue: PieceColor,
  timedOutColor: PieceColor | null
) => {
  if (timedOutColor) {
    const winner = timedOutColor === playerColorValue ? "ai" : "player";
    const winnerColor = winner === "player" ? playerColorValue : botColorValue;
    return `${winnerLabel(winner, playerNameValue, winnerColor)} wins on time.`;
  }

  const normalized = statusText.toLowerCase();

  if (normalized.includes("checkmate")) {
    const winnerColor: PieceColor = normalized.startsWith("white wins") ? "white" : "black";
    const winner = winnerColor === playerColorValue ? "player" : "ai";
    return `${winnerLabel(winner, playerNameValue, winnerColor)} wins by checkmate.`;
  }

  if (normalized.includes("stalemate")) {
    return `Draw by stalemate between ${playerNameValue} (${pieceColorLabel(playerColorValue)}) and AI (${pieceColorLabel(botColorValue)}).`;
  }

  if (normalized.includes("repetition")) {
    return `Draw by repetition between ${playerNameValue} (${pieceColorLabel(playerColorValue)}) and AI (${pieceColorLabel(botColorValue)}).`;
  }

  if (normalized.includes("insufficient material")) {
    return `Draw by insufficient material between ${playerNameValue} (${pieceColorLabel(playerColorValue)}) and AI (${pieceColorLabel(botColorValue)}).`;
  }

  if (normalized.startsWith("draw")) {
    return `Draw between ${playerNameValue} (${pieceColorLabel(playerColorValue)}) and AI (${pieceColorLabel(botColorValue)}).`;
  }

  return statusText;
};

const renderGameShell = () => {
  app.innerHTML = `
    <main class="play-shell">
      <div class="space-stage" id="board-stage"></div>
      <aside class="play-hud" id="hud-root"></aside>
    </main>
  `;
};

const startGame = async () => {
  if (!activePlayer) {
    renderAuth();
    return;
  }

  document.body.classList.add("game-mode");
  renderGameShell();

  const boardStage = document.querySelector<HTMLElement>("#board-stage");
  const hudRoot = document.querySelector<HTMLElement>("#hud-root");

  if (!boardStage || !hudRoot) {
    throw new Error("Required game UI nodes were not found.");
  }

  const playerColor: PieceColor = selectedDifficulty === "Impossible" ? "black" : "white";
  const chessScene: BoardRenderer =
    isMobileChessDevice() ? new FlatChessBoard(boardStage) : new ChessScene(boardStage);
  const controller = new ChessController();
  const aiController = new AiMoveController(controller, {
    playerColor,
    botColor: playerColor === "white" ? "black" : "white"
  });
  const hud = new Hud(hudRoot);
  // The player's own pieces are always nearest the controls, including
  // Impossible mode where the human is Black and Stockfish starts as White.
  chessScene.setPlayerColor?.(playerColor);
  let lastAudibleMoveCount = 0;
  let lastAlertSignature = "";
  const baseClockMs = DIFFICULTY_CONFIG[selectedDifficulty].clockSeconds * 1000;
  const remainingMs: Record<PieceColor, number> = {
    white: baseClockMs,
    black: baseClockMs
  };
  let timedOutSide: PieceColor | null = null;
  let lastTickAt = performance.now();
  let activeTurnColor: PieceColor = controller.getSnapshot().currentTurn;
  let recordedOutcomeSignature = "";
  const botColor: PieceColor = playerColor === "white" ? "black" : "white";
  let sessionActive = true;
  let clockStarted = false;
  const compactLayout = isMobileChessDevice();
  let externalResult: string | null = null;
  let reviewPly: number | null = null;
  let premoveSelected: SquareId | null = null;
  let queuedPremove: { from: SquareId; to: SquareId } | null = null;

  aiController.setPlayerIdentity(activePlayer.id, playerName);
  aiController.setDifficulty(selectedDifficulty);
  aiController.setPersonality(getPersonalityForDifficulty(selectedDifficulty).id);
  aiController.setTurnGuard(() => timedOutSide === null && externalResult === null);
  aiController.setClockState(
    remainingMs[playerColor],
    remainingMs[playerColor === "white" ? "black" : "white"],
    timedOutSide
  );
  aiController.reset();
  void aiController.hydrateAdaptiveMemory();

  const advanceClock = () => {
    if (!sessionActive || !clockStarted) return;

    const snapshot = controller.getSnapshot();
    const now = performance.now();
    const delta = Math.max(0, now - lastTickAt);
    lastTickAt = now;

    // Rapid 15+0: time carries across moves. Charge the previous mover
    // before switching clocks. Promotion choices remain on the active clock.
    // Calling this during a completed move (sync) also makes tab suspension
    // and asynchronous AI moves fair when animation frames are throttled.
    if (!snapshot.gameOver && !timedOutSide && !externalResult) {
      remainingMs[activeTurnColor] = Math.max(0, remainingMs[activeTurnColor] - delta);
      if (remainingMs[activeTurnColor] <= 0) {
        timedOutSide = activeTurnColor;
      } else {
        activeTurnColor = snapshot.currentTurn;
      }
    }
  };

  const tickClock = () => {
    if (!sessionActive) return;
    advanceClock();
    aiController.setClockState(
      remainingMs[playerColor],
      remainingMs[botColor],
      timedOutSide
    );
    if (sessionActive) window.requestAnimationFrame(tickClock);
  };

  const sync = () => {
    advanceClock();
    const snapshot = controller.getSnapshot();
    const preferences = hud.getPreferences();
    const premoveTargets = premoveSelected
      ? controller.getPremoveTargets(premoveSelected, playerColor)
      : [];
    const displayTargets = premoveSelected ? premoveTargets : snapshot.legalTargets;
    const selectedForDisplay = premoveSelected ?? snapshot.selectedSquare;
    const selectedPiece = selectedForDisplay
      ? snapshot.pieces.find((piece) => !piece.captured && piece.square === selectedForDisplay) ?? null
      : null;
    const captureTargets =
      selectedPiece === null
        ? []
        : displayTargets.filter((target) =>
            snapshot.pieces.some(
              (piece) =>
                !piece.captured && piece.square === target && piece.color !== selectedPiece.color
            )
          );

    if (snapshot.moveCount > lastAudibleMoveCount && snapshot.lastMoveSoundCue) {
      if (preferences.sounds) soundboard.playCue(snapshot.lastMoveSoundCue);
      lastAudibleMoveCount = snapshot.moveCount;
    }

    if (snapshot.moveCount === 0) {
      lastAudibleMoveCount = 0;
      lastAlertSignature = "";
    }

    const nextAlertSignature = `${snapshot.moveCount}:${snapshot.statusText}:${snapshot.inCheck}:${snapshot.gameOver}`;
    if (nextAlertSignature !== lastAlertSignature) {
      if (timedOutSide) {
      } else if (snapshot.gameOver) {
        if (snapshot.statusText.toLowerCase().includes("checkmate")) {
          if (preferences.sounds) soundboard.playCue("checkmate");
        } else if (snapshot.statusText.toLowerCase().includes("stalemate")) {
          if (preferences.sounds) soundboard.playCue("stalemate");
        }
      } else if (snapshot.inCheck && snapshot.moveCount > 0) {
        if (preferences.sounds) soundboard.playCue("check");
      }

      lastAlertSignature = nextAlertSignature;
    }

    if (timedOutSide || snapshot.gameOver || externalResult) {
      const outcomeSignature = `${snapshot.moveCount}:${snapshot.statusText}:${timedOutSide ?? "none"}:${externalResult ?? ""}`;
      const historyStatusText = externalResult ?? formatMatchHistoryStatus(
        snapshot.statusText,
        playerName,
        playerColor,
        botColor,
        timedOutSide
      );
      if (outcomeSignature !== recordedOutcomeSignature) {
        if (externalResult) {
          aiController.recordMatchOutcome("win", outcomeSignature);
          aiController.recordMatchHistory("win", snapshot.moveCount, externalResult, outcomeSignature);
        } else if (timedOutSide) {
          aiController.recordMatchOutcome(timedOutSide === playerColor ? "win" : "loss", outcomeSignature);
          aiController.recordMatchHistory(
            timedOutSide === playerColor ? "win" : "loss",
            snapshot.moveCount,
            historyStatusText,
            outcomeSignature
          );
        } else if (snapshot.statusText.toLowerCase().startsWith("draw")) {
          aiController.recordMatchOutcome("draw", outcomeSignature);
          aiController.recordMatchHistory("draw", snapshot.moveCount, historyStatusText, outcomeSignature);
        } else if (snapshot.statusText.startsWith("White wins")) {
          const result = botColor === "white" ? "win" : "loss";
          aiController.recordMatchOutcome(result, outcomeSignature);
          aiController.recordMatchHistory(result, snapshot.moveCount, historyStatusText, outcomeSignature);
        } else if (snapshot.statusText.startsWith("Black wins")) {
          const result = botColor === "black" ? "win" : "loss";
          aiController.recordMatchOutcome(result, outcomeSignature);
          aiController.recordMatchHistory(result, snapshot.moveCount, historyStatusText, outcomeSignature);
        }

        recordedOutcomeSignature = outcomeSignature;
      }
    }

    const reviewing = reviewPly !== null;
    const board = reviewPly === null ? snapshot : controller.getReplaySnapshot(reviewPly);
    chessScene.syncBoardState(board.pieces, reviewing ? null : snapshot.lastMove);
    chessScene.highlightSquares(
      reviewing ? null : selectedForDisplay,
      reviewing || !preferences.legalMoves ? [] : displayTargets,
      reviewing || !preferences.legalMoves ? [] : captureTargets,
      preferences.highlights ? board.lastMove : null,
      board.checkedKingSquare
    );
    chessScene.setPremoveHighlights?.(reviewing ? null : queuedPremove?.from ?? null, reviewing ? null : queuedPremove?.to ?? null);
    boardStage.classList.toggle("cedar-hide-coordinates", !preferences.coordinates);
    boardStage.classList.toggle("cedar-hide-highlights", !preferences.highlights);
    hud.renderStatus(snapshot, aiController.getState(), compactLayout, {
      history: controller.getMoveHistory(),
      reviewPly,
      premove: queuedPremove,
      selectingPremove: premoveSelected,
      externalResult
    });
  };

  aiController.setStateListener(sync);

  const syncAndRunBotTurn = async () => {
    if (!sessionActive || externalResult || timedOutSide) return;
    sync();
    const moved = await aiController.maybeRunBotTurn();
    if (!sessionActive) return;
    if (moved) {
      if (!queuedPremove && premoveSelected) premoveSelected = null;
      sync();
    }

    // A premove is attempted only AFTER the AI turn finishes. The move
    // is strictly checked against the new real chess position, and
    // cancelled if Stockfish changed the board in an unexpected way.
    if (moved && queuedPremove && !externalResult && !timedOutSide) {
      const premove = queuedPremove;
      queuedPremove = null;
      premoveSelected = null;
      if (controller.getSnapshot().currentTurn === playerColor &&
          controller.hasLegalMove(premove.from, premove.to)) {
        const destination = controller.resolveCastleDestination(premove.from, premove.to) ?? premove.to;
        const pawn = controller.getSnapshot().pieces.find(p => !p.captured && p.square === premove.from);
        const promoting = pawn?.role === "pawn" && (destination.endsWith("8") || destination.endsWith("1"));
        const made = controller.applyUciMove(`${premove.from}${destination}${promoting ? "q" : ""}`);
        if (made) {
          remainingMs[playerColor] = Math.max(0, remainingMs[playerColor] - 100);
          if (remainingMs[playerColor] <= 0) timedOutSide = playerColor;
          if (!timedOutSide) aiController.reactToPlayerMove();
          sync();
          if (!timedOutSide) void syncAndRunBotTurn();
          return;
        }
      }
      sync();
    }
  };

  hud.bindReset(() => {
    controller.resetGame();
    aiController.reset();
    hud.resetForNewMatch();
    reviewPly = null;
    queuedPremove = null;
    premoveSelected = null;
    externalResult = null;
    chessScene.setPlayerColor?.(playerColor);
    lastAudibleMoveCount = 0;
    remainingMs.white = baseClockMs;
    remainingMs.black = baseClockMs;
    timedOutSide = null;
    activeTurnColor = controller.getSnapshot().currentTurn;
    lastTickAt = performance.now();
    recordedOutcomeSignature = "";
    aiController.setClockState(
      remainingMs[playerColor],
      remainingMs[playerColor === "white" ? "black" : "white"],
      timedOutSide
    );
    sync();

    if (controller.getSnapshot().currentTurn === botColor) {
      void syncAndRunBotTurn();
    }
  });

  hud.bindPromotion((role: PieceRole) => {
    if (externalResult || timedOutSide) return;
    const moved = controller.promotePiece(role);
    sync();
    if (moved) {
      aiController.reactToPlayerMove();
      void syncAndRunBotTurn();
    }
  });

  hud.bindReplay((ply) => {
    reviewPly = ply;
    sync();
  });

  hud.bindResign(() => {
    if (externalResult || timedOutSide || controller.getSnapshot().gameOver) return;
    externalResult = `${playerName} resigned. AI wins.`;
    queuedPremove = null;
    premoveSelected = null;
    reviewPly = null;
    sync();
  });

  hud.bindCancelPremove(() => {
    queuedPremove = null;
    premoveSelected = null;
    sync();
  });

  hud.bindPreference((key: keyof BoardPreferences, enabled) => {
    if (key === "premoves" && !enabled) {
      queuedPremove = null;
      premoveSelected = null;
    }
    sync();
  });

  hud.bindCopyPgn(() => {
    const pgn = controller.getPgn() || "*";
    void navigator.clipboard.writeText(pgn).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = pgn;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    });
  });

  hud.bindDownloadPgn(() => {
    const data = new Blob([controller.getPgn() || "*"], { type: "application/x-chess-pgn" });
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cedar-chess-game.pgn";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  });

  hud.bindCycleCamera(() => {
    if (chessScene.flipBoard) chessScene.flipBoard();
    else chessScene.cycleCameraPreset(controller.getSnapshot().lastMove);
  });

  hud.bindCameraView((view) => {
    chessScene.setCameraPreset?.(view);
  });

  hud.bindZoomIn(() => {
    chessScene.zoomIn();
  });

  hud.bindZoomOut(() => {
    chessScene.zoomOut();
  });

  hud.bindBackToMenu(() => {
    renderMenu();
  });

  chessScene.setSquareSelectHandler((square) => {
    const snapshot = controller.getSnapshot();
    if (!sessionActive || timedOutSide || externalResult || snapshot.gameOver ||
        reviewPly !== null || snapshot.pendingPromotion) return;

    if (snapshot.currentTurn === playerColor && aiController.canPlayerInteract()) {
      queuedPremove = null;
      premoveSelected = null;
      const moved = controller.selectSquare(square);
      if (moved) aiController.reactToPlayerMove();
      sync();
      if (moved) void syncAndRunBotTurn();
      return;
    }

    if (snapshot.currentTurn !== playerColor && hud.getPreferences().premoves) {
      const ownPiece = snapshot.pieces.find(p => !p.captured && p.square === square && p.color === playerColor);
      if (premoveSelected) {
        const from = premoveSelected;
        const destination = controller.resolveCastleDestination(from, square) ?? square;
        const targets = controller.getPremoveTargets(from, playerColor);
        if (targets.includes(destination)) {
          queuedPremove = { from, to: destination };
          premoveSelected = null;
          sync();
          return;
        }
      }
      premoveSelected = ownPiece ? square : null;
      queuedPremove = null;
      sync();
    }
  });

  try {
    await chessScene.loadScene();
    clockStarted = true;
    lastTickAt = performance.now();
    sync();
    window.requestAnimationFrame(tickClock);
    if (controller.getSnapshot().currentTurn === (playerColor === "white" ? "black" : "white")) {
      void syncAndRunBotTurn();
    }

    if (import.meta.env.DEV) {
      window.__WOODEN_CHESS_DEBUG__ = {
        controller,
        aiController,
        sync,
        syncAndRunBotTurn
      };
    }

    activeSessionCleanup = () => {
      if (!sessionActive) {
        return;
      }

      sessionActive = false;
      aiController.dispose();
      chessScene.dispose();
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    hudRoot.innerHTML = `<div class="top-hud"><div class="turn-badge"><span class="hero-label">Runtime error</span><strong>Scene initialization failed</strong><p>${message}</p></div></div>`;
    console.error(error);
  }
};

const initApp = async () => {
  authListenerCleanup?.();
  authListenerCleanup = onPlayerSessionChange((event, session) => {
    activePlayer = session?.user
      ? {
          id: session.user.id,
          username:
            typeof session.user.user_metadata.username === "string" && session.user.user_metadata.username.length > 0
              ? session.user.user_metadata.username
              : session.user.email?.split("@")[0] ?? "player",
          displayName:
            typeof session.user.user_metadata.display_name === "string" &&
            session.user.user_metadata.display_name.length > 0
              ? session.user.user_metadata.display_name
              : typeof session.user.user_metadata.username === "string" &&
                  session.user.user_metadata.username.length > 0
                ? session.user.user_metadata.username
                : "Player"
        }
      : null;

    if (event === "PASSWORD_RECOVERY" && activePlayer) {
      passwordRecoveryAuthorized = true;
      renderPasswordRecovery();
    }
  });

  activePlayer = await getCurrentPlayer();

  if (passwordRecoveryAuthorized) {
    renderPasswordRecovery();
    return;
  }

  if (searchParams.get("reset-password") === "1") {
    renderForgotPassword();
    return;
  }

  if (searchParams.get("autostart") === "1" && activePlayer) {
    soundboard.prime();
    await startGame();
    return;
  }

  if (activePlayer) {
    renderMenu();
    return;
  }

  renderAuth();
};

void initApp();
