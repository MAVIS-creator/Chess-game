/**
 * Device classification uses the physical input/device as well as CSS width.
 * Mobile Chrome's "Desktop site" can expose a ~980px layout viewport despite
 * still being a phone; that must not switch the actual game to WebGL chess.
 */
export const isMobileChessDevice = () => {
  const agent = navigator.userAgent;
  const handset = /Android|iPhone|iPod|Mobile/i.test(agent);
  const touchHardware = navigator.maxTouchPoints > 0 || window.matchMedia("(any-pointer: coarse)").matches;
  const narrowScreen = Math.min(window.screen.width, window.screen.height) <= 740;
  return window.matchMedia("(max-width: 640px)").matches || handset || (touchHardware && narrowScreen);
};
