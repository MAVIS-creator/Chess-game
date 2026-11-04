import type { PieceColor, PieceRole } from "../game/types";

/**
 * Original vector chess set for the Cedar 2D board.
 * SVG is inlined once per occupied square: no network fonts, no blurry
 * Unicode font fallback, and identical shapes across Android/iOS/desktop.
 */
const SHAPES: Record<PieceRole, string> = {
  pawn: `
    <circle class="piece-body" cx="50" cy="28" r="12.5"/>
    <path class="piece-body" d="M43 41 H57 L61 51 C65 58 68 64 68 70 H32 C32 64 35 58 39 51 Z"/>
    <path class="piece-detail" d="M38 52 H62 M35 67 H65"/>
  `,
  rook: `
    <path class="piece-body" d="M25 20 H36 V29 H44 V20 H56 V29 H64 V20 H75 V40 H25 Z"/>
    <path class="piece-body" d="M32 40 H68 L65 69 H35 Z"/>
    <path class="piece-detail" d="M28 37 H72 M38 45 H62 M37 64 H63"/>
  `,
  knight: `
    <path class="piece-body" d="M34 70 C34 60 36 52 43 45 L37 36 L41 24 L48 19
      L57 23 L68 32 L72 42 L68 48 L58 47 C57 56 63 63 67 70 Z"/>
    <path class="piece-detail" d="M45 23 L49 36 M49 49 Q55 53 62 50"/>
    <circle class="piece-eye" cx="55.5" cy="34" r="3"/>
    <path class="piece-detail" d="M65 41 L71 40"/>
  `,
  bishop: `
    <path class="piece-body" d="M50 17 C60 27 67 34 66 45 C66 53 60 58 57 62
      H43 C40 58 34 53 34 45 C33 34 40 27 50 17 Z"/>
    <path class="piece-detail" d="M60 30 L43 53"/>
    <path class="piece-body" d="M40 62 H60 L65 70 H35 Z"/>
    <circle class="piece-detail-dot" cx="50" cy="15" r="3.5"/>
  `,
  queen: `
    <circle class="piece-detail-dot" cx="23" cy="24" r="4"/>
    <circle class="piece-detail-dot" cx="37" cy="18" r="4"/>
    <circle class="piece-detail-dot" cx="50" cy="14" r="4"/>
    <circle class="piece-detail-dot" cx="63" cy="18" r="4"/>
    <circle class="piece-detail-dot" cx="77" cy="24" r="4"/>
    <path class="piece-body" d="M23 31 L34 48 L37 31 L45 47 L50 26 L55 47 L63 31 L66 48 L77 31 L68 68 H32 Z"/>
    <path class="piece-detail" d="M34 55 H66 M32 65 H68"/>
  `,
  king: `
    <path class="piece-body" d="M46 15 H54 V25 H64 V32 H54 V41 H46 V32 H36 V25 H46 Z"/>
    <path class="piece-body" d="M39 42 Q32 47 35 56 L40 67 H60 L65 56 Q68 47 61 42
      Q55 46 50 46 Q45 46 39 42 Z"/>
    <path class="piece-detail" d="M42 52 H58 M39 65 H61"/>
  `
};

export const renderFlatPiece = (color: PieceColor, role: PieceRole): string => `
  <svg class="flat-piece-svg is-${color}" viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <ellipse class="piece-floor" cx="50" cy="84.5" rx="31" ry="4.2" />
    <g stroke-linecap="round" stroke-linejoin="round">
      ${SHAPES[role]}
      <path class="piece-base" d="M30 71 H70 L74 79 H26 Z"/>
      <path class="piece-base-detail" d="M29 75 H71"/>
    </g>
  </svg>
`;
