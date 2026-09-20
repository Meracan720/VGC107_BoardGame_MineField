/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

/* Combat, clue snapshots, and endgame pressure. No timers or private plans. */
const GameRules = (() => {
  const suddenDeathRound = 21;
  const suddenDeath = () => state.round >= suddenDeathRound;

  function damage(player, amount) {
    player.hp = Math.max(0, player.hp - amount);
    player.alive = player.hp > 0;
    return player.alive ? "" : ` ${player.name} is eliminated.`;
  }

  function attack(player, dirName) {
    const dir = DIRS[dirName];
    const target = attackRegion(player, dirName).map(tile =>
      state.players.find(p => p.alive && p.id !== player.id && p.x === tile.x && p.y === tile.y)
    ).find(Boolean);
    if (!target) {
      state.log = `${player.name} attacks ${dir.symbol}, but nobody is there.`;
      return;
    }
    let prefix = "";
    if (target.dodge) {
      const escape = DIRS[target.dodge];
      target.dodge = false;
      if (escape && canEnter(target.x + escape.dx, target.y + escape.dy, target.id)) {
        target.x += escape.dx; target.y += escape.dy;
        const event = triggerTile(target);
        state.log = `${target.name} dodges ${player.name}'s attack by sidestepping ${escape.symbol}.` + (event ? ` ${event}` : "");
        return;
      }
      prefix = `${target.name}'s dodge destination is blocked; the dodge fails. `;
    }
    const x = target.x + dir.dx, y = target.y + dir.dy;
    if (!inBounds(x, y) || isBlockingTerrain(tileAt(x, y))) {
      state.log = prefix + `${player.name} knocks ${target.name} against terrain or the board edge: 1 HP damage.` + damage(target, 1);
    } else if (!canEnter(x, y, target.id)) {
      state.log = prefix + `${player.name}'s push is blocked by another player; no damage is dealt.`;
    } else {
      target.x = x; target.y = y;
      const event = triggerTile(target);
      state.log = prefix + `${player.name} pushes ${target.name} ${dir.symbol}.` + (event ? ` ${event}` : "");
    }
  }

  function disarm(player, dirName) {
    const dir = DIRS[dirName];
    const x = player.x + dir.dx, y = player.y + dir.dy;
    if (!inBounds(x, y) || isBlockingTerrain(tileAt(x, y))) {
      state.log = `${player.name}'s disarm target is blocked or outside the board; the action is skipped.`;
      return;
    }
    const tile = tileAt(x, y), removed = tile.type === "mine";
    tile.type = "safe";
    tile.initialMine = tile.scannedInitialMine = false;
    GridVisibility.reveal(tile);
    state.log = removed ? `${player.name} disarms 1 bomb ${dir.symbol}.`
      : `${player.name} checks ${dir.symbol}: no bomb. This grid is safe.`;
  }

  function scan(player, region) {
    for (const tile of region) {
      tile.clueCount = surroundingTiles(tile).filter(t => t.type === "mine").length;
      tile.clueRound = state.round;
    }
    state.log = region.length === 1
      ? `${player.name} scans: ${region[0].clueCount} bombs in the surrounding eight grids.`
      : `${player.name} records ${region.length} numbered clues. Each counts bombs in its eight neighboring grids.`;
    state.log += ` Snapshot from round ${state.round}; bomb positions stay hidden.`;
  }

  function revealBombs(player, region) {
    let found = 0;
    for (const tile of region) {
      tile.clueCount = tile.clueRound = null;
      if (tile.type !== "mine") continue;
      GridVisibility.reveal(tile);
      if (tile.initialMine) tile.scannedInitialMine = true;
      found++;
    }
    state.log = `${player.name} scans three grids: ${found} bombs found. Bombs are revealed directly; no numbered clues are shown.`;
  }

  function clearanceResult(game) {
    if (game.board.some(t => t.type === "mine")) return null;
    const living = game.players.filter(p => p.alive);
    if (living.length <= 1) return null; // Last survivor / no survivors takes precedence.
    const best = Math.max(...living.map(p => p.hp));
    const winners = living.filter(p => p.hp === best);
    const names = winners.map(p => p.name).join(" & ");
    return {title: `${names} ${winners.length === 1 ? "Wins" : "Share Victory"}!`,
      text: `All bombs cleared. Highest surviving HP: ${best}. Ties share victory.`,
      log: `All bombs cleared. ${names} ${winners.length === 1 ? "wins" : "share victory"} with ${best} HP.`};
  }

  return Object.freeze({suddenDeathRound, suddenDeath, damage, attack, disarm, scan, revealBombs, clearanceResult});
})();
