const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

test("Opening scans publish all eight starting clues without spending points or granting adjustments", () => {
  const {run, elements} = game({playerCount: "8"});
  run(`
    startGame();
    assert.equal(state.phase, "rolling");
    assert.equal(state.board.filter(t => Number.isInteger(t.clueCount)).length, 8);
    state.players.forEach(p => {
      const t = tileAt(p.x, p.y);
      assert.equal(t.clueCount, surroundingTiles(t).filter(n => n.type === "mine").length);
      assert.equal(t.clueRound, 1);
      assert.equal(p.roll, null);
      assert.equal(p.pointsRemaining, 0);
      assert.equal(Boolean(p.scanMoveReady), false);
    });
    assert.ok(state.board.filter(t => t.type === "mine").every(t => !t.revealed));
  `);
  assert.equal(elements.get("board").children.filter(c => c.children.some(n => n.classList.contains("scan-clue"))).length, 8);
});

test("Batch resolution pauses at the Move, using the position after an intervening push", () => {
  const {run, elements} = game();
  run(`
    const [p, other] = state.players;
    p.x = 4; p.y = 4; other.x = 3; other.y = 4;
    p.program = [{action: "SCAN"}, {action: "MOVE", dir: "RIGHT"}, {action: "DODGE", dir: "UP"}];
    other.program = [{action: "ATTACK", dir: "RIGHT"}];
    beginExecution(); resolveAll();
    assert.equal(state.executionIndex, 2);
    assert.equal(p.x, 5); assert.equal(p.y, 4);
    assert.equal(state.pendingScanMove.playerId, p.id);
    assert.equal(state.queue[2].done, false);
    assert.equal(tileAt(4, 4).clueRound, 1);
    resolveNext(); resolveAll();
    assert.equal(state.executionIndex, 2);
    selectBoardTile(tileAt(7, 4));
    assert.equal(state.executionIndex, 2);
  `);
  assert.equal(elements.get("resolveAllBtn").disabled, true);
  assert.equal(elements.get("scanMoveChoice").classList.contains("hidden"), false);
  assert.ok(elements.get("board").children[55].classList.contains("move-reachable"));
  elements.get("board").children[55].click();
  run(`
    assert.equal(p.x, 5); assert.equal(p.y, 5);
    assert.equal(p.pointsRemaining, 0);
    assert.equal(state.executionIndex, 3);
    assert.equal(state.queue[2].dir, "DOWN");
    assert.equal(state.queue[3].dir, "UP");
    assert.equal(state.pendingScanMove, null);
    assert.equal(p.scanMoveReady, false);
    confirmScanMove("LEFT");
    assert.equal(state.executionIndex, 3);
  `);
  assert.equal(elements.get("resolveAllBtn").disabled, false);
});

test("Repeated scans do not stack and keeping a blocked direction still spends the Move", () => {
  const {run, elements} = game();
  run(`
    const p = state.players[0];
    tileAt(1, 0).type = "wall";
    p.program = [{action: "SCAN"}, {action: "SCAN"}, {action: "MOVE", dir: "RIGHT"}, {action: "MOVE", dir: "DOWN"}];
    beginExecution(); resolveAll();
    assert.equal(state.executionIndex, 2);
    selectBoardTile(tileAt(1, 0));
    assert.equal(state.executionIndex, 2);
  `);
  elements.get("keepScanMoveBtn").click();
  run(`
    assert.equal(p.x, 0); assert.equal(p.y, 0);
    assert.equal(state.executionIndex, 3);
    resolveNext();
    assert.equal(state.executionIndex, 4);
    assert.equal(p.y, 1);
    assert.equal(state.pendingScanMove, null);
  `);
});

test("Unused adjustments expire and eliminated players never pause execution", () => {
  const {run} = game();
  run(`
    const p = state.players[0];
    p.program = [{action: "SCAN"}];
    beginExecution(); resolveAll();
    assert.equal(state.round, 2);
    assert.equal(p.scanMoveReady, false);
    p.program = [{action: "SCAN"}, {action: "MOVE", dir: "RIGHT"}];
    beginExecution(); resolveNext();
    GameRules.damage(p, p.hp);
    resolveAll();
    assert.equal(state.pendingScanMove, null);
    assert.equal(state.round, 3);
  `);
});

test("New Game cancels a pending choice and directional scans grant no adjustment", () => {
  const {run, elements} = game();
  run(`
    const p = state.players[0];
    p.program = [{action: "SCAN"}, {action: "MOVE", dir: "RIGHT"}];
    beginExecution(); resolveAll(); resetToSetup(); confirmScanMove("RIGHT"); startGame();
    assert.equal(Boolean(state.pendingScanMove), false);
    const next = state.players[0]; next.x = 4; next.y = 4;
    executeAction(next, {action: "AREA_SCAN", dir: "RIGHT"});
    executeAction(next, {action: "TRI_SCAN", dir: "LEFT"});
    assert.equal(Boolean(next.scanMoveReady), false);
  `);
  assert.equal(elements.get("scanMoveChoice").classList.contains("hidden"), true);
});

test("Bots adjust without pausing and do not inspect hidden bombs", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.controller = "moderate";
    p.x = 4; p.y = 4;
    tileAt(5, 4).type = "mine"; GridVisibility.reveal(tileAt(5, 4));
    tileAt(4, 5).type = "safe"; GridVisibility.reveal(tileAt(4, 5));
    p.program = [{action: "SCAN"}, {action: "MOVE", dir: "RIGHT"}];
    beginExecution(); resolveNext(); resolveNext();
    assert.equal(p.x, 4); assert.equal(p.y, 5);
    assert.equal(state.pendingScanMove, null);
    assert.equal(p.scanMoveReady, false);
    state.board = makeBoard();
    const before = GameAgents.scanMoveDirection(p, "RIGHT");
    tileAt(5, 5).type = "mine";
    assert.equal(GameAgents.scanMoveDirection(p, "RIGHT"), before);
  `);
});
