const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");
const settle = () => new Promise(resolve => setImmediate(resolve));
const finishHuman = 'completeDicePhase(); chooseAction("DISCARD"); confirmProgram();';

test("Setup supports solo, mixed, and all-human games and retains bot settings", () => {
  const {run, elements} = game({humanCount: "1", botDifficulty: "expert", playerCount: "6"});
  run(`
    assert.equal(state.players.filter(p => p.controller).length, 5);
    assert.equal(state.players[0].controller, null);
    assert.equal(state.players[5].controller, "expert");
    resetToSetup(); startGame();
    assert.equal(state.config.humanCount, 1);
    assert.equal(state.config.botDifficulty, "expert");
  `);
  assert.equal(elements.get("botDifficulty").disabled, false);
  elements.get("humanCount").value = "all";
  run("startGame(); assert.equal(state.players.some(p => p.controller), false);");
  assert.equal(elements.get("botDifficulty").disabled, true);
  elements.get("humanCount").value = "5";
  elements.get("playerCount").value = "3";
  run("startGame(); assert.equal(state.config.humanCount, 3);");
});

for (const level of ["new-player", "moderate", "expert"]) {
  test(`${level} bots fill legal programs, enter execution, and return to the human`, async () => {
    const {run, elements} = game({humanCount: "1", botDifficulty: level});
    run('Math.random = () => 0.9; globalThis.beforeBoard = JSON.stringify(state.board);');
    run(finishHuman);
    await settle();
    run(`
      assert.equal(state.phase, "execution");
      assert.equal(state.agentFailures.size, 0);
      assert.equal(JSON.stringify(state.board), beforeBoard);
      for (const p of state.players) {
        assert.equal(p.pointsRemaining, 0);
        assert.equal(p.program.reduce((sum, a) => sum + ACTIONS[a.action].cost, 0), p.roll);
        assert.ok(p.program.length <= 6);
        for (const a of p.program) {
          if (ACTIONS[a.action].needsDir) assert.ok(directionAllowed(a.action, a.dir));
        }
      }
      resolveAll();
      assert.equal(state.round, 2);
      assert.equal(state.phase, "rolling");
      assert.equal(currentPlanner().id, 1);
      assert.equal(currentPlanner().roll, null);
    `);
    assert.equal(elements.get("diceControls").classList.contains("hidden"), false);
    assert.equal(elements.get("botControls").classList.contains("hidden"), true);
  });
}

test("Mixed games keep the human pass screen and skip bot pass screens", async () => {
  const {run, elements} = game({humanCount: "2"});
  run(finishHuman);
  run("assert.equal(currentPlanner().id, 1);");
  assert.equal(elements.get("passControls").classList.contains("hidden"), false);
  run("readyNextPlayer(); assert.equal(currentPlanner().id, 2);");
  run(finishHuman);
  await settle();
  run('assert.equal(state.phase, "execution"); assert.equal(state.agentFailures.size, 0);');
});

test("Agent observations redact private information and cannot mutate the engine", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    globalThis.views = [];
    MinefieldAgents.register("observer", {label: "Observer", chooseAction(view) {
      views.push(JSON.parse(JSON.stringify(view)));
      view.players[0].hp = -100;
      view.board[0].type = "mine";
      view.self.pointsRemaining = 1000;
      return {action: "DISCARD"};
    }});
    state.players.slice(1).forEach(p => p.controller = "observer");
    tileAt(3, 3).type = "mine";
    tileAt(4, 4).type = "mine"; tileAt(4, 4).revealed = true;
    tileAt(5, 5).type = "wall";
  `);
  run(finishHuman);
  await settle();
  run(`
    assert.ok(views.length >= 2);
    const view = views[0];
    assert.equal(view.version, 2);
    assert.equal(view.board[33].type, "unknown");
    assert.equal(view.board[44].type, "mine");
    assert.equal(view.board[55].type, "wall");
    assert.equal(view.board[0].type, "unknown");
    assert.deepEqual(Object.keys(view.players[0]).sort(), ["alive", "hp", "id", "roll", "x", "y"]);
    assert.equal("queue" in view, false);
    assert.equal("log" in view, false);
    assert.equal(state.players[0].hp, 3);
    assert.equal(tileAt(0, 0).type, "safe");
    assert.equal(state.players[1].pointsRemaining, 0);
    assert.equal(state.agentFailures.size, 0);
  `);
});

test("Human controls and board previews cannot reveal or alter a pending bot turn", async () => {
  const {run, elements} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("slow", {label: "Slow", chooseAction: () => new Promise(resolve => globalThis.release = resolve)});
    state.players[1].controller = "slow";
  `);
  run(finishHuman);
  await settle();
  run(`
    const p = currentPlanner();
    const before = JSON.stringify(p);
    rollDice(); chooseAction("MOVE"); selectBoardTile(tileAt(8, 8)); confirmProgram(); undoLastAction(); readyNextPlayer();
    assert.equal(JSON.stringify(p), before);
    assert.equal(selection.action, null);
  `);
  assert.equal(elements.get("planningControls").classList.contains("hidden"), true);
  assert.equal(elements.get("botControls").classList.contains("hidden"), false);
  assert.equal(elements.get("board").children.some(c => c.classList.contains("move-reachable")), false);
  assert.equal(elements.get("programList").textContent.includes("Move"), false);
  assert.equal(elements.get("message").textContent.includes("rolled"), false);
  run("resetToSetup();");
  await settle();
});

for (const response of [
  'return {action: "MOVE", dir: "OUTSIDE"};',
  'return {action: "__proto__"};',
  'throw new Error("Unavailable");',
  'return Promise.reject(new Error("Unavailable"));',
  'view.legalActions[0] = {action: "MOVE", dir: "DOWN_RIGHT", cost: 0}; return view.legalActions[0];',
]) {
  test(`Invalid or failed agent falls back without exceeding the roll: ${response}`, async () => {
    const {run} = game({humanCount: "1"});
    run(`
      MinefieldAgents.register("invalid", {label: "Invalid", chooseAction(view) { ${response} }});
      state.players[1].controller = "invalid";
      Math.random = () => 0.9;
    `);
    run(finishHuman);
    await settle();
    run(`
      assert.equal(state.phase, "execution");
      assert.ok(state.agentFailures.has(2));
      assert.equal(state.players[1].pointsRemaining, 0);
      assert.equal(state.players[1].program.length, 6);
      assert.ok(state.players[1].program.every(a => a.action === "DISCARD"));
    `);
  });
}

test("A hung agent times out and late replies cannot add actions", async () => {
  const {run, timers} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("hung", {label: "Hung", chooseAction: () => new Promise(resolve => globalThis.late = resolve)});
    state.players[1].controller = "hung";
  `);
  run(finishHuman);
  await settle();
  timers.find(fn => fn)();
  await settle();
  run('assert.equal(state.phase, "execution"); assert.ok(state.agentFailures.has(2)); globalThis.saved = JSON.stringify(state.queue); late({action: "DODGE"});');
  await settle();
  run("assert.equal(JSON.stringify(state.queue), saved);");
});

test("New Game cancels pending adapters and ignores their old results", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("pending", {label: "Pending", chooseAction(view, {signal}) {
      globalThis.oldSignal = signal;
      return new Promise(resolve => globalThis.oldReply = resolve);
    }});
    state.players[1].controller = "pending";
  `);
  run(finishHuman);
  await settle();
  run('resetToSetup(); startGame(); assert.equal(oldSignal.aborted, true); oldReply({action: "DODGE"});');
  await settle();
  run('assert.equal(state.phase, "rolling"); assert.equal(currentPlanner().id, 1); assert.ok(state.players.every(p => p.program.length === 0));');
});

test("Eliminated humans can watch subsequent bot rounds without a deadlock", async () => {
  const {run, elements} = game({humanCount: "1"});
  run("state.players[0].alive = false; state.players[0].hp = 0; finishRound(); completeDicePhase();");
  await settle();
  run('assert.equal(state.phase, "execution"); assert.ok(state.queue.every(a => a.playerId !== 1));');
  assert.match(elements.get("message").textContent, /All humans are eliminated/);
  run("resolveAll(); completeDicePhase();");
  await settle();
  run('assert.equal(state.phase, "execution"); assert.equal(state.round, 3);');
});

test("Cancelling before dispatch does not call an adapter with the replacement game's data", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    globalThis.calls = 0;
    MinefieldAgents.register("unstarted", {label: "Unstarted", chooseAction() { calls++; return {action: "DISCARD"}; }});
    state.players[1].controller = "unstarted";
    ${finishHuman}
    resetToSetup(); startGame();
  `);
  await settle();
  run('assert.equal(calls, 0); assert.equal(currentPlanner().id, 1); assert.equal(state.round, 1);');
});

test("Moderate and Expert exploit visible mine pushes; Expert prepares unknown ground", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("capture", {label: "Capture", chooseAction(view) { globalThis.sample = view; return {action: "DISCARD"}; }});
    state.players[1].controller = "capture";
    state.players[1].x = 4; state.players[1].y = 4;
    state.players[0].x = 5; state.players[0].y = 4;
    tileAt(6, 4).type = "mine"; tileAt(6, 4).revealed = true;
    Math.random = () => 0;
  `);
  run(finishHuman);
  await settle();
  run(`
    for (const level of ["moderate", "expert"]) {
      const choice = MinefieldAgents.get(level).chooseAction(sample);
      assert.equal(choice.action, "ATTACK"); assert.equal(choice.dir, "RIGHT");
    }
    sample.players[0].x = 0; sample.players[0].y = 0;
    sample.board.forEach(t => t.type = "unknown");
    sample.self.hp = 3;
    assert.equal(MinefieldAgents.get("expert").chooseAction(sample).action, "DISARM");
    assert.equal(MinefieldAgents.get("moderate").chooseAction(sample).action, "MOVE");
    assert.equal(MinefieldAgents.get("new-player").chooseAction(sample).action, "MOVE");
  `);
});

test("Providers can register async choices and are selectable in setup", async () => {
  const {run, elements} = game({humanCount: "1"});
  run('MinefieldAgents.register("custom", {label: "Custom Agent", chooseAction: async view => view.legalActions.find(a => a.action === "DODGE")}); updateSetupConfig();');
  assert.ok(elements.get("botDifficulty").children.some(option => option.value === "custom"));
  elements.get("botDifficulty").value = "custom";
  run("startGame();");
  run(finishHuman);
  await settle();
  run('assert.equal(state.phase, "execution"); assert.equal(state.agentFailures.size, 0); assert.ok(state.players[1].program.every(a => a.action === "DODGE"));');
});

test("Agents can program a wall break followed by moving through that wall", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("wall-walker", {label: "Wall Walker", chooseAction(view) {
      if (!view.self.program.length) return {action: "BREAK_WALL", dir: "LEFT"};
      assert.equal(view.board[98].type, "wall");
      assert.ok(view.legalActions.some(a => a.action === "MOVE" && a.dir === "LEFT"));
      return {action: "MOVE", dir: "LEFT"};
    }});
    state.players[1].controller = "wall-walker";
    tileAt(8, 9).type = "wall";
    Math.random = () => 0.4;
  `);
  run(finishHuman);
  await settle();
  run(`
    assert.equal(state.agentFailures.size, 0);
    assert.equal(state.phase, "execution");
    assert.deepEqual(state.players[1].program.map(a => a.action), ["BREAK_WALL", "MOVE"]);
    assert.equal(tileAt(8, 9).type, "wall");
    resolveAll();
    assert.equal(tileAt(8, 9).type, "safe");
    assert.equal(state.players[1].x, 8);
    assert.equal(state.players[1].y, 9);
  `);
});
