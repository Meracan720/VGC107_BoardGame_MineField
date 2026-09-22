/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

/* Grid knowledge is independent of contents and explosion-marker lifetime.
 * Only an observation refreshes knowledge; planting never changes this state. */
const GridVisibility = (() => {
  const durations = Object.freeze({clear: Infinity, default: 2, hard: 1});
  const hints = {
    clear: "Explored grids stay known for the whole game.",
    default: "Grids stay known for the reveal round and the following round, then become unknown.",
    hard: "Grids stay known for the reveal round, then become unknown next round.",
  };

  function setup() {
    const input = el("visibilityMode");
    if (!Object.hasOwn(durations, input.value)) input.value = "default";
    el("visibilityHint").textContent = hints[input.value] + " Numbered clues use the same lifetime. Initial bombs found by 3-Grid Scan or 3×3 Scan stay visible until removed. Planting changes neither visibility nor stored clue numbers. Walls and ridges stay visible.";
    return {visibilityMode: input.value};
  }

  function reveal(tile) {
    tile.revealed = true;
    tile.lastRevealedRound = state.round;
  }

  function expire() {
    const duration = durations[state.config.visibilityMode];
    for (const tile of state.board) {
      if (Number.isInteger(tile.clueRound) && state.round - tile.clueRound >= duration) {
        tile.clueCount = tile.clueRound = null;
      }
      if (tile.type === "mine" && tile.scannedInitialMine) continue;
      if (isBlockingTerrain(tile) || !tile.revealed || !Number.isInteger(tile.lastRevealedRound)) continue;
      if (state.round - tile.lastRevealedRound >= duration) tile.revealed = false;
    }
  }

  return Object.freeze({setup, reveal, expire});
})();
