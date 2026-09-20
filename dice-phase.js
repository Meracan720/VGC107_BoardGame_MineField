/* Public, ordered rolls happen once before anyone may program actions. */
const DicePhase = (() => {
  let timer = null;
  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function current() {
    return state?.phase === "rolling" ? livingPlayers()[state.rollingIndex] || null : null;
  }
  function scheduleBot() {
    const p = current();
    if (!GameAgents.isBot(p)) return;
    const game = state, round = state.round;
    timer = setTimeout(() => {
      if (state !== game || state.round !== round || current() !== p) return;
      timer = null;
      roll();
    }, 450);
  }
  function begin() {
    cancel();
    state.phase = "rolling";
    state.rollingIndex = 0;
    state.planningIndex = 0;
    selection = {action: null, dir: null, path: [], target: null};
    actionButtons.forEach(button => button.disabled = true);
    for (const id of ["planningControls", "passControls", "botControls", "executionControls", "winnerControls"]) {
      el(id).classList.add("hidden");
    }
    state.log = `Round ${state.round}: everyone rolls in playing order before planning.`
      + (GameRules.suddenDeath() ? " Sudden Death is active: triggering a bomb is now lethal." : "");
    render();
    scheduleBot();
  }
  function roll() {
    const p = current();
    if (!p || p.roll !== null) return;
    cancel();
    p.roll = Math.floor(Math.random() * MAX_ACTION_POINTS) + 1;
    p.pointsRemaining = p.roll;
    state.rollingIndex++;
    state.log = `${p.name} rolled ${p.roll}.` + (current() ? ` Next: ${current().name}.` : " All rolls are ready. Begin planning when everyone is ready.");
    render();
    scheduleBot();
  }
  function startPlanning() {
    if (state?.phase !== "rolling" || current() || livingPlayers().some(p => p.roll === null)) return;
    cancel();
    state.phase = "planning";
    state.planningIndex = 0;
    state.log = `${currentPlanner().name}: privately program your ${currentPlanner().roll} points.`;
    beginPlanningForCurrent();
    render();
  }
  function renderSummary() {
    const rolling = state.phase === "rolling";
    const p = current();
    el("diceControls").classList.toggle("hidden", !rolling);
    el("rollDiceBtn").disabled = !rolling || !p || GameAgents.isBot(p);
    el("rollDiceBtn").textContent = p ? `Roll for ${p.name}` : "All Players Rolled";
    el("beginPlanningBtn").disabled = !rolling || Boolean(p);
    el("dicePhaseHint").textContent = p
      ? GameAgents.isBot(p) ? `${p.name} is rolling…` : `${p.name}: roll your action points.`
      : "Everyone's points are shown above the player cards. Begin planning when ready.";
    const summary = el("roundDice");
    summary.innerHTML = "";
    const players = TurnOrder.players();
    summary.style.gridTemplateColumns = `repeat(${players.length}, minmax(0, 1fr))`;
    players.forEach(player => {
      const column = document.createElement("div");
      column.className = "round-die" + (p?.id === player.id ? " rolling-player" : "");
      column.title = `${player.name}: ${player.roll === null ? player.alive ? "Waiting to roll" : "Eliminated" : `${player.roll} points`}`;
      const name = document.createElement("span");
      name.textContent = `P${player.id}`;
      const cube = document.createElement("span");
      cube.className = "allocation-cell round-die-cube " + (player.roll === null ? "locked" : "usable");
      cube.textContent = player.roll === null ? "—" : String(player.roll);
      column.appendChild(name);
      column.appendChild(cube);
      summary.appendChild(column);
    });
  }
  return Object.freeze({begin, current, roll, startPlanning, cancel, render: renderSummary});
})();
