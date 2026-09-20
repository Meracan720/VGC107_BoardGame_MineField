/* Local decision policies and the public extension registry. No DOM or game-state access.
 * An adapter implements chooseAction(observation, {signal}) and may return a Promise.
 * See AGENTS_API.md for the versioned observation and action contract.
 */
const MinefieldAgents = (() => {
  const registry = new Map();
  function register(id, provider) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(id) || registry.has(id)) {
      throw new Error("Agent IDs must be unique, lowercase names (up to 40 characters).");
    }
    if (!provider || typeof provider.chooseAction !== "function" ||
        typeof provider.label !== "string" || !provider.label.trim()) {
      throw new Error("An agent needs a label and chooseAction function.");
    }
    registry.set(id, Object.freeze({label: provider.label.slice(0, 60), chooseAction: provider.chooseAction}));
  }

  function attackTarget(origin, dir, at, opponents) {
    for (let step = 1; step <= (dir.dx && dir.dy ? 1 : 2); step++) {
      const tile = at(origin.x + dir.dx * step, origin.y + dir.dy * step);
      if (!tile || tile.type === "wall" || tile.type === "ridge") break;
      const target = opponents.find(p => p.x === tile.x && p.y === tile.y);
      if (target) return target;
    }
    return null;
  }

  // Predict only our own program. Scans cannot reveal their results during planning;
  // movement/pushes/cleared mines are optimistic because other players act between us.
  function forecast(view) {
    const board = view.board.map(tile => ({...tile}));
    const opponents = view.players.filter(p => p.alive && p.id !== view.self.id).map(p => ({...p}));
    const at = (x, y) => board.find(t => t.x === x && t.y === y);
    const occupied = (x, y) => opponents.some(p => p.x === x && p.y === y);
    const blocked = tile => !tile || tile.type === "wall" || tile.type === "ridge";
    const damageOpponent = (target, amount) => {
      target.hp = Math.max(0, target.hp - amount);
      if (target.hp === 0) opponents.splice(opponents.indexOf(target), 1);
    };
    const visited = new Map();
    let x = view.self.x, y = view.self.y;
    let defended = false, planted = false;
    for (const item of view.self.program) {
      const dir = view.directions[item.dir];
      if (item.action === "MOVE") {
        visited.set(`${x},${y}`, (visited.get(`${x},${y}`) || 0) + 1);
        x += dir.dx; y += dir.dy;
      } else if (item.action === "DISARM") {
        const tile = at(x + dir.dx, y + dir.dy);
        if (!blocked(tile)) tile.type = "safe";
      } else if (item.action === "DODGE") defended = true;
      else if (item.action === "BOMB" || item.action === "BREAK_WALL") {
        const tile = at(x + dir.dx, y + dir.dy);
        if (tile && !tile.exploded && !occupied(tile.x, tile.y)) {
          if (item.action === "BREAK_WALL" && tile.type === "wall") { tile.type = "safe"; tile.exploded = true; }
          else if (item.action === "BOMB" && !blocked(tile)) { tile.type = "mine"; planted = true; }
        }
      } else if (item.action === "ATTACK") {
        const target = attackTarget({x, y}, dir, at, opponents);
        if (target) {
          const next = at(target.x + dir.dx, target.y + dir.dy);
          if (blocked(next)) {
            damageOpponent(target, 1);
          } else if (!occupied(next.x, next.y)) {
            target.x = next.x; target.y = next.y;
            if (next.type === "mine") {
              damageOpponent(target, view.suddenDeath ? target.hp : 1);
              next.type = "safe";
              next.exploded = true;
            }
          }
        }
      }
    }
    return {board, opponents, at, occupied, blocked, visited, defended, planted};
  }

  function choose(view, level) {
    const model = forecast(view);
    const {board, opponents, at, occupied, blocked} = model;
    const position = view.position;
    const expert = level === "expert";
    const risk = tile => {
      if (tile.type === "mine") return view.suddenDeath ? 30 : expert ? 14 : 8;
      if (tile.type !== "unknown") return 0;
      const clues = board.filter(t => Number.isInteger(t.clueCount) &&
        Math.max(Math.abs(t.x - tile.x), Math.abs(t.y - tile.y)) === 1);
      // Snapshot counts influence caution, never turn a guess into known contents.
      const clueRisk = clues.length ? clues.reduce((n, t) => n + t.clueCount, 0) / clues.length / 8 : 0.2;
      return (expert ? 1.5 + 2 / view.self.hp : 0.45) + clueRisk * (view.suddenDeath ? 12 : 3);
    };
    const distanceToEnemy = tile => Math.min(...opponents.map(p => Math.abs(p.x - tile.x) + Math.abs(p.y - tile.y)));

    const canAttack = origin => Object.values(view.directions).some(dir => attackTarget(origin, dir, at, opponents));

    // Reverse weighted shortest paths to attack positions. Routes go
    // around terrain, prefer safe grids, and never use hidden mine locations.
    const distances = new Map();
    const pending = board.filter(t => !blocked(t) && !occupied(t.x, t.y));
    for (const tile of pending) {
      distances.set(`${tile.x},${tile.y}`, canAttack(tile) ? 0 : Infinity);
    }
    while (pending.length) {
      pending.sort((a, b) => distances.get(`${a.x},${a.y}`) - distances.get(`${b.x},${b.y}`));
      const tile = pending.shift();
      const distance = distances.get(`${tile.x},${tile.y}`);
      if (!Number.isFinite(distance)) break;
      for (const dir of Object.values(view.directions)) {
        const key = `${tile.x + dir.dx},${tile.y + dir.dy}`;
        if (distances.has(key)) distances.set(key, Math.min(distances.get(key), distance + 1 + risk(tile)));
      }
    }
    const distance = tile => distances.get(`${tile.x},${tile.y}`) ?? Infinity;
    const threatened = canAttack(position);
    const scanned = view.self.program.some(a => a.action.includes("SCAN"));

    function score(choice) {
      const target = choice.target && at(choice.target.x, choice.target.y);
      if (choice.action === "MOVE") {
        if (occupied(target.x, target.y)) return -50;
        const progress = Number.isFinite(distance(position)) && Number.isFinite(distance(target))
          ? distance(position) - distance(target) : distanceToEnemy(position) - distanceToEnemy(target);
        return 6 + progress * 4 - risk(target) * 3 - (model.visited.get(`${target.x},${target.y}`) || 0) * 4;
      }
      if (choice.action === "ATTACK") {
        const dir = view.directions[choice.dir];
        const enemy = attackTarget(position, dir, at, opponents);
        if (!enemy) return -15;
        const pushed = at(enemy.x + dir.dx, enemy.y + dir.dy);
        if (blocked(pushed)) return enemy.hp === 1 ? 55 : 32;
        if (occupied(pushed.x, pushed.y)) return -20;
        return 12 + (pushed.type === "mine" ? 35 : pushed.type === "unknown" ? 10 : 0);
      }
      if (choice.action === "DISARM") {
        return target.type === "mine" ? 25 : target.type === "unknown"
          ? (expert || view.suddenDeath || view.self.hp === 1 ? 12 + risk(target) : 2) : -5;
      }
      if (choice.action === "DODGE") {
        if (occupied(target.x, target.y) || target.type === "mine") return -50;
        return threatened && !model.defended ? (expert ? 18 : 10) - risk(target) * 2 : -10;
      }
      if (choice.action === "BREAK_WALL") return !Number.isFinite(distance(position)) ? 20 : -3;
      if (choice.action === "BOMB") {
        if (occupied(target.x, target.y)) return -30;
        if (model.planted || target.type === "mine") return -15;
        return distanceToEnemy(target) <= 2 ? (expert ? 11 : 7) : -8;
      }
      if (choice.action.includes("SCAN")) {
        const fresh = choice.region.filter(t => choice.action === "TRI_SCAN"
          ? at(t.x, t.y).type === "unknown" : at(t.x, t.y).clueRound !== view.round).length;
        return scanned ? -10 : fresh / choice.cost - 2;
      }
      return -12;
    }

    let candidates = view.legalActions;
    if (level === "new-player") {
      if (!candidates.some(a => a.action === "MOVE")) {
        const escape = candidates.find(a => a.action === "BREAK_WALL");
        if (escape) return escape;
      }
      // Beginners wander, occasionally miss opportunities, and take more risks.
      candidates = candidates.filter(a => a.action === "MOVE" || a.action === "ATTACK" && score(a) > 0 ||
        a.action === "DODGE" || a.action === "TRI_SCAN" || a.action === "DISARM" && score(a) > 0);
      if (!candidates.length) candidates = view.legalActions;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return candidates.map(action => ({action, value: score(action) + Math.random() * (expert ? 0.2 : 3)}))
      .sort((a, b) => b.value - a.value)[0].action;
  }

  register("new-player", {label: "New Player", chooseAction: view => choose(view, "new-player")});
  register("moderate", {label: "Moderate", chooseAction: view => choose(view, "moderate")});
  register("expert", {label: "Expert", chooseAction: view => choose(view, "expert")});
  return Object.freeze({
    version: 2,
    register,
    list: () => [...registry].map(([id, provider]) => ({id, label: provider.label})),
    get: id => registry.get(id),
  });
})();
