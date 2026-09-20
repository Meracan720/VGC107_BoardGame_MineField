/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

/* Bridge between the game engine and local/async agents. Only this file reads
 * engine state; providers receive detached, redacted observations. */
const GameAgents = (() => {
  const TURN_TIMEOUT_MS = 10000;
  let pending = null;

  function cancel() {
    if (pending) pending.abort();
    pending = null;
  }

  function setup(playerCount) {
    const input = el("humanCount");
    const requested = Number(input.value);
    const humanCount = input.value === "all" ? playerCount
      : !Number.isInteger(requested) || requested < 1 ? 1 : Math.min(playerCount, requested);
    if (input.value !== "all") input.value = String(humanCount);
    const difficulty = el("botDifficulty");
    // Registered adapters appear beside built-in levels on the next setup refresh.
    const selected = difficulty.value;
    difficulty.innerHTML = "";
    MinefieldAgents.list().forEach(({id, label}) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = label;
      difficulty.appendChild(option);
    });
    difficulty.value = MinefieldAgents.get(selected) ? selected : "moderate";
    difficulty.disabled = humanCount === playerCount;
    const descriptions = {
      "new-player": "Wanders and takes risks; a forgiving opponent for learning the game.",
      moderate: "Pursues opponents, avoids visible mines, and uses basic tactics.",
      expert: "Plans safer routes, disarms hazards, and looks for damaging pushes and nearby bomb placements.",
    };
    el("botDifficultyHint").textContent = humanCount === playerCount
      ? "Choose fewer human players to add bots."
      : descriptions[difficulty.value] || "Custom agent. Uses the same action costs and visible information as local bots.";
    return {humanCount, botDifficulty: difficulty.value};
  }

  function isBot(p) { return Boolean(p?.controller); }
  function humanTurn() { return state?.phase === "planning" && !isBot(currentPlanner()); }

  function legalActions(p) {
    const preview = planningPreview(p);
    const origin = preview.position;
    const choices = [];
    for (const [action, rule] of Object.entries(ACTIONS)) {
      if (rule.cost > p.pointsRemaining) continue;
      if (!rule.needsDir) {
        choices.push({action, dir: null, cost: rule.cost,
          ...(action === "SCAN" ? {region: [{x: origin.x, y: origin.y}]} : {})});
        continue;
      }
      for (const [dir, delta] of Object.entries(DIRS)) {
        if (!directionAllowed(action, dir)) continue;
        if (action === "ATTACK") {
          const region = attackRegion(origin, dir, preview).map(({x, y}) => ({x, y}));
          if (region.length) choices.push({action, dir, cost: rule.cost, target: region[0], region});
          continue;
        }
        const x = origin.x + delta.dx, y = origin.y + delta.dy;
        if (!inBounds(x, y)) continue;
        const tile = tileAt(x, y);
        if (action === "MOVE" && isPlanningBlocked(tile, preview)) continue;
        if (["DODGE", "DISARM"].includes(action) && isPlanningBlocked(tile, preview)) continue;
        if (action === "BOMB" && (isBlockingTerrain(tile) || tile.exploded)) continue;
        if (action === "BREAK_WALL" && (tile.type !== "wall" || tile.exploded)) continue;
        const scan = SCAN_RULES[action];
        const region = scan?.region(origin, dir);
        if (scan && region.length !== scan.size) continue;
        choices.push({action, dir, cost: rule.cost, target: {x, y},
          ...(region ? {region: region.map(({x, y}) => ({x, y}))} : {})});
      }
    }
    return choices;
  }

  function observation(p) {
    return {
      version: 2, size: SIZE, round: state.round,
      suddenDeath: GameRules.suddenDeath(),
      turnOrder: [...state.turnOrder],
      visibilityMode: state.config.visibilityMode,
      mutatorId: state.config.mutatorId,
      self: {id: p.id, x: p.x, y: p.y, hp: p.hp, roll: p.roll, pointsRemaining: p.pointsRemaining,
        program: p.program.map(({action, dir}) => ({action, dir}))},
      position: plannedPosition(p),
      players: state.players.map(({id, x, y, hp, alive, roll}) => ({id, x, y, hp, alive, roll})),
      board: state.board.map(t => ({x: t.x, y: t.y,
        type: t.revealed || isBlockingTerrain(t) ? t.type : "unknown", exploded: t.revealed && t.exploded,
        clueCount: t.clueCount, clueRound: t.clueRound})),
      bombs: bombCounts(),
      directions: Object.fromEntries(Object.entries(DIRS).map(([name, {dx, dy}]) => [name, {dx, dy}])),
      legalActions: legalActions(p),
    };
  }

  // Validate against a freshly generated choice list, never one an adapter can
  // mutate. The engine owns rolls, costs, allocations, and phase transitions.
  function append(p, response) {
    const choice = response && legalActions(p).find(a => a.action === response.action && a.dir === (response.dir ?? null));
    if (!choice) throw new Error("Agent returned an illegal action.");
    p.program.push({action: choice.action, dir: choice.dir, allocationId: ++state.allocationCounter});
    p.pointsRemaining -= choice.cost;
  }

  async function plan(p) {
    cancel();
    const controller = new AbortController();
    pending = controller;
    const game = state, round = state.round;
    const active = () => state === game && state.round === round && state.phase === "planning" &&
      currentPlanner() === p && pending === controller && !controller.signal.aborted;
    p.pointsRemaining = p.roll;
    state.log = `${p.name} is secretly planning.`;
    el("botMessage").textContent = state.log;
    render();
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Agent turn timed out.")), TURN_TIMEOUT_MS);
      controller.signal.addEventListener("abort", () => reject(new Error("Agent turn cancelled.")), {once: true});
    });
    let failed = false;
    try {
      const provider = MinefieldAgents.get(p.controller);
      while (p.pointsRemaining > 0 && active()) {
        const response = await Promise.race([
          Promise.resolve().then(() => {
            if (!active()) throw new Error("Agent turn cancelled.");
            return provider.chooseAction(observation(p), {signal: controller.signal});
          }), expired,
        ]);
        if (!active()) return;
        append(p, response);
      }
    } catch {
      if (!active()) return;
      failed = true;
      // Discard unallocated points; already accepted actions stay private.
      while (p.pointsRemaining > 0) append(p, {action: "DISCARD"});
    } finally {
      clearTimeout(timer);
      if (pending === controller) pending = null;
      controller.abort();
    }
    if (state !== game || state.round !== round || currentPlanner() !== p || state.phase !== "planning") return;
    if (failed) game.agentFailures.add(p.id);
    advance();
  }

  function begin(p) {
    el("botControls").classList.toggle("hidden", !isBot(p));
    if (!isBot(p)) return;
    el("planningControls").classList.add("hidden");
    void plan(p);
  }

  function advance(handedOff = false) {
    const next = livingPlayers()[state.planningIndex + 1];
    if (next) {
      // A designated/random sequence can put bots between two humans. Keep
      // the next human's screen private until someone acknowledges the handoff.
      if (!handedOff && !isBot(next) && livingPlayers().filter(p => !isBot(p)).length > 1) {
        state.awaitingHandoff = true;
        el("botControls").classList.add("hidden");
        el("planningControls").classList.add("hidden");
        el("passControls").classList.remove("hidden");
        el("passMessage").textContent = `Give the computer to ${next.name}. Their screen will appear after Ready.`;
        el("readyNextPlayerBtn").textContent = `Ready for ${next.name}`;
        state.log = "Bot planning complete. Ready for the next human player.";
        render();
        return;
      }
      state.awaitingHandoff = false;
      state.planningIndex++;
      state.log = `${next.name}: privately program your ${next.roll} points.`;
      beginPlanningForCurrent();
      render();
    } else beginExecution();
  }

  function ready() {
    if (state?.phase !== "planning" || !state.awaitingHandoff) return false;
    advance(true);
    return true;
  }

  function humanFinished() {
    const next = livingPlayers()[state.planningIndex + 1];
    // Solo needs no pass screen. Mixed games still require Ready before handing
    // a human's private planning controls to another person.
    if (isBot(next) || livingPlayers().filter(p => !isBot(p)).length <= 1) {
      advance();
      return true;
    }
    return false;
  }

  return Object.freeze({setup, cancel, isBot, humanTurn, begin, humanFinished, ready});
})();
