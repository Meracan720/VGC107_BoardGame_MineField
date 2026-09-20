/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {game, html} = require("./helpers");

test("Default setup is four seats, one human, Moderate bots, random order, five HP, sixteen walls, and twenty percent bombs", () => {
  const defaults = Object.fromEntries(["startingHp", "terrainCount", "bombPercent"].map(id => {
    const input = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*\\bvalue="([^"]+)"`));
    assert.ok(input, `Missing default value for ${id}`);
    return [id, input[1]];
  }));
  const selections = Object.fromEntries(["playerCount", "humanCount", "botDifficulty", "turnOrderMode", "terrainType", "visibilityMode"].map(id => {
    const select = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`));
    const selected = select[1].match(/<option value="([^"]+)" selected>/);
    assert.ok(selected, `Missing selected default for ${id}`);
    return [id, selected[1]];
  }));
  const {run, elements} = game({...defaults, ...selections});
  assert.equal(elements.get("startingHpValue").textContent, "5 HP");
  assert.equal(elements.get("terrainCountValue").textContent, "16");
  assert.equal(elements.get("bombPercentValue").textContent, "20%");
  run(`
    startGame();
    assert.equal(state.config.playerCount, 4);
    assert.equal(state.config.humanCount, 1);
    assert.equal(state.config.botDifficulty, "moderate");
    assert.equal(state.config.turnOrderMode, "random");
    assert.equal(state.config.terrainType, "wall");
    assert.equal(state.config.visibilityMode, "default");
    assert.equal(state.config.mutatorId, "last-survivor");
    assert.equal(state.config.startingHp, 5);
    assert.equal(state.config.wallCount, 16);
    assert.equal(state.config.bombPercent, 20);
    assert.equal(state.players.filter(p => p.controller === "moderate").length, 3);
    state.players.forEach(p => assert.equal(p.hp, 5));
    assert.equal(state.board.filter(tile => tile.type === "wall").length, 16);
    assert.equal(state.board.filter(tile => tile.type === "mine").length, 20);
    assert.equal(state.board.filter(tile => tile.type === "ridge").length, 0);
  `);
  assert.equal(elements.get("bombStats").textContent, "20 bombs / 0 found");
  run("resetToSetup();");
});

test("Open-board movement goes straight first, then diagonal, in every direction", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.x = 4; p.y = 4; p.pointsRemaining = 6;
    const paths = movementPaths(p);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const path = paths.get(tileKey(x, y));
        const dx = x - p.x, dy = y - p.y;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const straightSteps = Math.abs(Math.abs(dx) - Math.abs(dy));
        assert.equal(path.length, distance);
        let endX = p.x, endY = p.y;
        path.forEach((name, i) => {
          const dir = DIRS[name];
          assert.equal(dir.diagonal, i >= straightSteps);
          if (dir.dx) assert.equal(dir.dx, Math.sign(dx));
          if (dir.dy) assert.equal(dir.dy, Math.sign(dy));
          endX += dir.dx; endY += dir.dy;
        });
        assert.equal(endX, x); assert.equal(endY, y);
      }
    }
  `);
});

test("Movement can start diagonally to avoid terrain and still respects the point limit", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.x = 4; p.y = 4; p.pointsRemaining = 3;
    tileAt(5, 4).type = "wall";
    tileAt(6, 4).type = "ridge";
    const paths = movementPaths(p);
    assert.deepEqual(paths.get("7,5"), ["DOWN_RIGHT", "RIGHT", "RIGHT"]);
    assert.equal(paths.has("5,4"), false);
    assert.equal(paths.has("6,4"), false);
    p.pointsRemaining = 2;
    assert.equal(movementPaths(p).has("7,5"), false);
    p.pointsRemaining = 6;
    for (let y = 0; y < SIZE; y++) tileAt(5, y).type = "wall";
    assert.equal(movementPaths(p).has("7,5"), false);
  `);
});

test("Mixed movement previews, charges, and executes straight steps before diagonal steps", () => {
  const {run, elements, button} = game();
  run("state.players[0].x = 4; state.players[0].y = 4; Math.random = () => 0.5; completeDicePhase();");
  button("MOVE").click();
  run('selectBoardTile(tileAt(7, 5)); assert.deepEqual(selection.path, ["RIGHT", "RIGHT", "DOWN_RIGHT"]);');
  assert.equal(elements.get("confirmProgramBtn").textContent, "Add Move · 3 points");
  assert.match(elements.get("movementCostPreview").textContent, /3 points · 1 left/);
  assert.equal(elements.get("allocationTrack").children.filter(c => c.classList.contains("preview-move")).length, 3);
  for (const [x, y] of [[5, 4], [6, 4], [7, 5]]) {
    assert.equal(elements.get("board").children[y * 10 + x].classList.contains("planned-path"), true);
  }
  assert.equal(elements.get("board").children[57].classList.contains("selected-target"), true);
  elements.get("confirmProgramBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 1);
    assert.deepEqual(currentPlanner().program.map(item => item.dir), ["RIGHT", "RIGHT", "DOWN_RIGHT"]);
    assert.equal(currentPlanner().x, 4); assert.equal(currentPlanner().y, 4);
    beginExecution();
    resolveNext();
    assert.equal(state.players[0].x, 5); assert.equal(state.players[0].y, 4);
    resolveNext();
    assert.equal(state.players[0].x, 6); assert.equal(state.players[0].y, 4);
    resolveNext();
    assert.equal(state.players[0].x, 7); assert.equal(state.players[0].y, 5);
  `);
});

test("Separate straight and diagonal segments connect and Undo refunds only the last segment", () => {
  const {run, elements, button} = game();
  run("Math.random = () => 0.9; completeDicePhase();");
  button("MOVE").click();
  run("selectBoardTile(tileAt(2, 0));");
  elements.get("confirmProgramBtn").click();
  button("MOVE").click();
  run('selectBoardTile(tileAt(4, 2)); assert.deepEqual(selection.path, ["DOWN_RIGHT", "DOWN_RIGHT"]);');
  elements.get("confirmProgramBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 2);
    assert.deepEqual(plannedPosition(currentPlanner()), {x: 4, y: 2});
    assert.deepEqual(currentPlanner().program.map(item => item.dir), ["RIGHT", "RIGHT", "DOWN_RIGHT", "DOWN_RIGHT"]);
  `);
  elements.get("undoActionBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 4);
    assert.deepEqual(plannedPosition(currentPlanner()), {x: 2, y: 0});
    assert.deepEqual(currentPlanner().program.map(item => item.dir), ["RIGHT", "RIGHT"]);
  `);
});

test("Starting health applies to all six players and persists across rounds", () => {
  const {run, elements} = game({playerCount: "6", startingHp: "7"});
  assert.equal(elements.get("startingHpValue").textContent, "7 HP");
  run(`
    assert.equal(state.config.startingHp, 7);
    assert.equal(state.players.length, 6);
    state.players.forEach(p => assert.equal(p.hp, 7));
    tileAt(0, 0).type = "mine";
    triggerTile(state.players[0]);
    assert.equal(state.players[0].hp, 6);
    assert.equal(state.players[0].alive, true);
    finishRound();
    assert.equal(state.players[0].hp, 6);
    assert.equal(state.config.startingHp, 7);
  `);
  elements.get("newGameBtn").click();
  elements.get("startingHp").value = "4";
  elements.get("startingHp").listeners.input();
  assert.equal(elements.get("startingHpValue").textContent, "4 HP");
  elements.get("startGameBtn").click();
  run("state.players.forEach(p => assert.equal(p.hp, 4));");
});

test("One HP eliminates on the first mine; ten HP survives with nine remaining", () => {
  for (const startingHp of ["1", "10"]) {
    const {run} = game({startingHp});
    run(`
      const p = state.players[0];
      tileAt(p.x, p.y).type = "mine";
      triggerTile(p);
      assert.equal(p.hp, ${Number(startingHp) - 1});
      assert.equal(p.alive, ${Number(startingHp) > 1});
    `);
  }
});

for (const resolve of ["stepped", "batch"]) {
  test(`Triggered mines become normal safe grids next round with ${resolve} execution`, () => {
    const {run, elements} = game();
    run(`
      tileAt(1, 0).type = "mine";
      tileAt(2, 0).type = "mine";
      tileAt(2, 0).revealed = true;
      tileAt(3, 0).exploded = true; // An existing wall-demolition crater.
      state.players[0].program = [{action: "MOVE", dir: "RIGHT"}];
      state.players[1].program = [{action: "DISCARD"}];
      state.players[2].program = [{action: "DISCARD"}];
      beginExecution(); resolveNext();
      assert.equal(tileAt(1, 0).type, "safe");
      assert.equal(tileAt(1, 0).exploded, true);
      assert.equal(tileAt(1, 0).explosionRound, 1);
      assert.equal(state.players[0].hp, 2);
    `);
    assert.ok(elements.get("board").children[1].classList.contains("exploded"));
    run(resolve === "batch" ? "resolveAll();"
      : "while (state.executionIndex < state.queue.length) resolveNext(); resolveNext();");
    run(`
      assert.equal(state.round, 2);
      assert.equal(tileAt(1, 0).type, "safe");
      assert.equal(tileAt(1, 0).revealed, true);
      assert.equal(tileAt(1, 0).exploded, false);
      assert.equal(tileAt(2, 0).type, "mine");
      assert.equal(tileAt(3, 0).exploded, true);
      assert.equal(bombCounts().remaining, 2);
      // Return to the starting square so the cleared square is unoccupied.
      state.players[0].x = 0;
      executeAction(state.players[0], {action: "BOMB", dir: "RIGHT"});
      assert.equal(tileAt(1, 0).type, "mine");
      assert.equal(tileAt(1, 0).revealed, true);
    `);
    assert.equal(elements.get("board").children[1].classList.contains("exploded"), false);
    assert.ok(elements.get("board").children[1].classList.contains("safe"));
  });
}

test("Player health changes from numeric HP to hearts below five, then to eliminated", () => {
  const {run, elements} = game({startingHp: "5"});
  const health = () => elements.get("playerList").children[0].innerHTML.match(/<span class="hp[^>]*>([^<]*)<\/span>/)[1];
  assert.equal(health(), "5 / 5 HP");
  for (let remaining = 4; remaining >= 0; remaining--) {
    run('tileAt(0, 0).type = "mine"; triggerTile(state.players[0]); render();');
    assert.equal(health(), remaining ? "♥".repeat(remaining) : "ELIMINATED");
    if (remaining) {
      assert.match(elements.get("playerList").children[0].innerHTML, new RegExp(`aria-label="${remaining} of 5 HP"`));
    }
  }
});

test("Active player marker follows planning and execution, and clears for skipped or finished turns", () => {
  const {run, elements} = game();
  const activeCards = () => elements.get("playerList").children.filter(card => card.classList.contains("active"));
  const expectActive = number => {
    assert.equal(activeCards().length, 1);
    assert.match(activeCards()[0].innerHTML, new RegExp(`active-player-cube p${number}"`));
    assert.equal(elements.get("currentPlayerLabel").textContent, `Player ${number}`);
  };
  expectActive(1);
  run('completeDicePhase(); chooseAction("DISCARD"); confirmProgram(); readyNextPlayer();');
  expectActive(2);
  run('state.players.forEach(p => p.program = [{action: "DISCARD", dir: null}]); beginExecution();');
  expectActive(1);
  run("resolveNext();");
  expectActive(2);
  run("state.players[1].alive = false; state.players[1].hp = 0; render();");
  assert.equal(activeCards().length, 0);
  run("resolveNext();");
  expectActive(3);
  run("resolveNext();");
  assert.equal(activeCards().length, 0);
  run("finishRound();");
  expectActive(1);
  run("state.players[2].alive = false; state.players[2].hp = 0; checkWinner();");
  assert.equal(activeCards().length, 0);
  assert.equal(elements.get("currentPlayerLabel").textContent, "—");
});

test("Disarm requires a roll, costs one point, and removes nothing during planning", () => {
  const {run, elements, button} = game();
  assert.equal(button("DISARM").disabled, true);
  run('Math.random = () => 0; completeDicePhase(); tileAt(1, 0).type = "mine";');
  assert.equal(button("DISARM").disabled, false);
  assert.equal(button("DODGE").disabled, false);
  button("DISARM").click();
  assert.equal(elements.get("confirmProgramBtn").disabled, true);
  run("selectBoardTile(tileAt(1, 0));");
  assert.equal(elements.get("confirmProgramBtn").disabled, false);
  assert.equal(elements.get("board").children.filter(tile => tile.classList.contains("disarm-region")).length, 1);
  elements.get("confirmProgramBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 0);
    assert.equal(currentPlanner().program[0].action, "DISARM");
    assert.equal(currentPlanner().program[0].dir, "RIGHT");
    assert.equal(tileAt(1, 0).type, "mine");
  `);
  assert.equal(elements.get("allocationTrack").children[0].classList.contains("point-dodge"), true);
});

test("Undo refunds Disarm's single point and removes its allocation", () => {
  const {run, elements, button} = game();
  run("Math.random = () => 0.4; completeDicePhase();");
  button("DISARM").click();
  run("selectBoardTile(tileAt(1, 0));");
  elements.get("confirmProgramBtn").click();
  run("assert.equal(currentPlanner().pointsRemaining, 2);");
  elements.get("undoActionBtn").click();
  run("assert.equal(currentPlanner().pointsRemaining, 3); assert.equal(currentPlanner().program.length, 0);");
  assert.equal(elements.get("allocationTrack").children.filter(c => c.classList.contains("usable")).length, 3);
});

test("Dodge unlocks with one point, allocates one cube, and refunds one point on undo", () => {
  const {run, elements, button} = game();
  assert.equal(button("DODGE").disabled, true);
  run("Math.random = () => 0; completeDicePhase();");
  assert.equal(button("DODGE").disabled, false);
  button("DODGE").click();
  run("selectBoardTile(tileAt(1, 0));");
  assert.equal(elements.get("confirmProgramBtn").textContent, "Add Dodge · 1 point");
  elements.get("confirmProgramBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 0);
    assert.equal(currentPlanner().program.length, 1);
    assert.equal(currentPlanner().program[0].action, "DODGE");
    assert.equal(currentPlanner().dodge, false);
  `);
  assert.equal(elements.get("allocationTrack").children.filter(c => c.classList.contains("point-dodge")).length, 1);
  // A two-point roll leaves planning open so Undo is available through the UI.
  run("startGame(); Math.random = () => 0.2; completeDicePhase();");
  button("DODGE").click();
  run("selectBoardTile(tileAt(1, 0));");
  elements.get("confirmProgramBtn").click();
  run("assert.equal(currentPlanner().pointsRemaining, 1);");
  elements.get("undoActionBtn").click();
  run("assert.equal(currentPlanner().pointsRemaining, 2); assert.equal(currentPlanner().program.length, 0);");
  assert.equal(elements.get("allocationTrack").children.filter(c => c.classList.contains("point-dodge")).length, 0);
});

test("Bomb stats show the configured total and reset discoveries on a new game", () => {
  const {run, elements} = game({bombPercent: "30"});
  run("startGame();");
  assert.equal(elements.get("bombStats").textContent, "30 bombs / 0 found");
  run('state.board.filter(tile => tile.type === "mine").slice(0, 15).forEach(tile => tile.revealed = true); render();');
  assert.equal(elements.get("bombStats").textContent, "30 bombs / 15 found");
  elements.get("newGameBtn").click();
  elements.get("startGameBtn").click();
  assert.equal(elements.get("bombStats").textContent, "30 bombs / 0 found");
});

test("Bomb stats track scans, planting, disarming, and explosions as queued actions resolve", () => {
  const {run, elements} = game({emptyBoard: true});
  const expectStats = value => assert.equal(elements.get("bombStats").textContent, value);
  run(`
    tileAt(1, 0).type = "mine"; tileAt(2, 0).type = "mine";
    state.players[0].program = [
      {action: "SCAN"}, {action: "SCAN"}, {action: "BOMB", dir: "DOWN"},
    ];
    beginExecution();
  `);
  expectStats("2 bombs / 0 found");
  run("resolveNext();");
  expectStats("2 bombs / 0 found");
  run("resolveNext();");
  expectStats("2 bombs / 0 found");
  run("resolveNext();");
  expectStats("3 bombs / 0 found");
  run(`
    finishRound();
    state.players[0].program = [
      {action: "DISARM", dir: "RIGHT"}, {action: "MOVE", dir: "RIGHT"},
      {action: "SCAN"}, {action: "MOVE", dir: "RIGHT"},
    ];
    beginExecution();
  `);
  expectStats("3 bombs / 0 found");
  run("resolveNext();");
  expectStats("2 bombs / 0 found");
  run("resolveNext(); resolveNext();");
  expectStats("2 bombs / 0 found");
  run("resolveNext();");
  expectStats("1 bomb / 0 found");
  run("finishRound();");
  expectStats("1 bomb / 0 found");
});

test("Resolve Remaining updates bomb stats and wall demolition does not count as a bomb", () => {
  const {run, elements} = game({emptyBoard: true});
  run(`
    tileAt(1, 0).type = "mine"; tileAt(0, 1).type = "wall";
    state.players[0].program = [{action: "SCAN"}, {action: "BREAK_WALL", dir: "DOWN"}];
    beginExecution(); resolveAll();
  `);
  assert.equal(elements.get("bombStats").textContent, "1 bomb / 0 found");
  run(`
    state.players[0].program = [{action: "DISARM", dir: "RIGHT"}];
    beginExecution(); resolveAll();
  `);
  assert.equal(elements.get("bombStats").textContent, "0 bombs / 0 found");
});

for (const scan of [
  {action: "SCAN", cost: 1, grids: 1, mine: {x: 5, y: 5}},
  {action: "AREA_SCAN", cost: 3, grids: 9, mine: {x: 6, y: 4}},
]) {
  test(`${scan.action} previews and records clue counts without revealing bombs or destroying walls`, () => {
    const {run, elements, button} = game();
    run(`
      state.players[0].x = 4; state.players[0].y = 4;
      tileAt(5, 4).type = "wall"; tileAt(5, 4).revealed = true;
      tileAt(4, 5).type = "wall"; tileAt(4, 5).revealed = true;
      tileAt(${scan.mine.x}, ${scan.mine.y}).type = "mine";
      Math.random = () => 0.5; completeDicePhase();
    `);
    button(scan.action).click();
    if (scan.action !== "SCAN") run("selectBoardTile(tileAt(5, 4));");
    assert.equal(elements.get("confirmProgramBtn").disabled, false);
    assert.equal(elements.get("board").children.filter(tile => tile.classList.contains("scan-region")).length, scan.grids);
    const mineCell = elements.get("board").children[scan.mine.y * 10 + scan.mine.x];
    assert.equal(mineCell.classList.contains("scan-region"), scan.action !== "SCAN");
    assert.equal(mineCell.classList.contains("mine"), false);
    elements.get("confirmProgramBtn").click();
    run(`
      assert.equal(currentPlanner().pointsRemaining, ${4 - scan.cost});
      assert.equal(tileAt(${scan.mine.x}, ${scan.mine.y}).revealed, false);
      beginExecution(); resolveNext();
      assert.equal(tileAt(${scan.mine.x}, ${scan.mine.y}).revealed, false);
      const clueTiles = state.board.filter(t => Number.isInteger(t.clueCount));
      assert.equal(clueTiles.length, ${scan.grids});
      clueTiles.forEach(t => assert.equal(t.clueCount, surroundingTiles(t).filter(n => n.type === "mine").length));
      assert.equal(tileAt(5, 4).type, "wall");
      assert.equal(tileAt(4, 5).type, "wall");
      assert.equal(canEnter(5, 4, 1), false);
    `);
    assert.equal(elements.get("bombStats").textContent, "2 bombs / 0 found");
  });
}

test("Breaking a wall costs two points and opens a safe grid only when executed", () => {
  const {run, elements, button} = game();
  assert.equal(button("BREAK_WALL").disabled, true);
  run('tileAt(1, 0).type = "wall"; Math.random = () => 0.4; completeDicePhase();');
  button("BREAK_WALL").click();
  run("selectBoardTile(tileAt(1, 0));");
  assert.equal(elements.get("confirmProgramBtn").disabled, false);
  assert.equal(elements.get("confirmProgramBtn").textContent, "Add Break Wall · 2 points");
  elements.get("confirmProgramBtn").click();
  run(`
    assert.equal(currentPlanner().pointsRemaining, 1);
    assert.equal(tileAt(1, 0).type, "wall");
    assert.equal(canEnter(1, 0, 1), false);
  `);
  assert.equal(button("BREAK_WALL").disabled, true);
  assert.equal(elements.get("allocationTrack").children.filter(c => c.classList.contains("point-bomb")).length, 2);
  elements.get("undoActionBtn").click();
  run("assert.equal(currentPlanner().pointsRemaining, 3); assert.equal(tileAt(1, 0).type, 'wall');");
  button("BREAK_WALL").click();
  run("selectBoardTile(tileAt(1, 0));");
  elements.get("confirmProgramBtn").click();
  run(`
    beginExecution(); resolveNext();
    assert.equal(tileAt(1, 0).type, "safe");
    assert.equal(tileAt(1, 0).revealed, true);
    assert.equal(canEnter(1, 0, 1), true);
    assert.equal(state.players[0].hp, state.config.startingHp);
    assert.match(state.queue[0].resultLog, /destroys a wall/);
    executeAction(state.players[0], {action: "MOVE", dir: "RIGHT"});
    assert.equal(state.players[0].x, 1);
    assert.equal(state.players[0].hp, state.config.startingHp);
  `);
  assert.equal(elements.get("bombStats").textContent, "1 bomb / 0 found");
});

test("A queued wall break opens a selectable path without changing live terrain before execution", () => {
  const {run, elements} = game();
  run(`
    tileAt(1, 0).type = "wall";
    Math.random = () => 0.4; completeDicePhase();
    assert.equal(movementPaths(currentPlanner()).has("1,0"), false);
    chooseAction("BREAK_WALL"); selectBoardTile(tileAt(1, 0)); confirmProgram();
    assert.deepEqual(movementPaths(currentPlanner()).get("1,0"), ["RIGHT"]);
    assert.equal(tileAt(1, 0).type, "wall");
    assert.equal(canEnter(1, 0, 1), false);
  `);
  assert.ok(elements.get("board").children[1].classList.contains("move-reachable"));
  run(`
    chooseAction("MOVE"); selectBoardTile(tileAt(1, 0)); confirmProgram();
    assert.deepEqual(state.players[0].program.map(a => a.action), ["BREAK_WALL", "MOVE"]);
    assert.equal(state.players[0].pointsRemaining, 0);
    beginExecution(); resolveNext();
    assert.equal(tileAt(1, 0).type, "safe");
    assert.equal(state.players[0].x, 0);
    resolveNext();
    assert.equal(state.players[0].x, 1);
    assert.equal(state.players[0].hp, 3);
  `);
});

test("Wall-break paths use the queued position and Undo restores the wall restriction", () => {
  const {run} = game();
  run(`
    tileAt(1, 1).type = "wall"; tileAt(1, 0).type = "wall";
    Math.random = () => 0.9; completeDicePhase();
    chooseAction("MOVE"); selectBoardTile(tileAt(0, 1)); confirmProgram();
    chooseAction("BREAK_WALL"); selectBoardTile(tileAt(1, 1)); confirmProgram();
    assert.deepEqual(movementPaths(currentPlanner()).get("2,1"), ["RIGHT", "RIGHT"]);
    assert.equal(movementPaths(currentPlanner()).has("1,0"), false);
    undoLastAction();
    assert.deepEqual(plannedPosition(currentPlanner()), {x: 0, y: 1});
    assert.equal(movementPaths(currentPlanner()).has("1,1"), false);
    assert.equal(currentPlanner().pointsRemaining, 5);
    // Neither a different player's secret wall break nor a bomb aimed at a
    // ridge can make those grids enter the movement preview.
    state.players[1].x = 2; state.players[1].y = 1;
    state.players[1].program = [{action: "BREAK_WALL", dir: "LEFT"}];
    tileAt(0, 2).type = "ridge";
    currentPlanner().program.push({action: "BREAK_WALL", dir: "DOWN"});
    assert.equal(movementPaths(currentPlanner()).has("1,1"), false);
    assert.equal(movementPaths(currentPlanner()).has("0,2"), false);
  `);
});

test("A one-point roll cannot break a wall, and the two-point action cannot destroy ridges", () => {
  const {run, button} = game();
  run("Math.random = () => 0; completeDicePhase();");
  assert.equal(button("BREAK_WALL").disabled, true);
  run(`
    tileAt(1, 0).type = "ridge";
    executeAction(state.players[0], {action: "BREAK_WALL", dir: "RIGHT"});
    assert.equal(tileAt(1, 0).type, "ridge");
    assert.equal(canEnter(1, 0, 1), false);
    assert.equal(directionAllowed("BREAK_WALL", "DOWN_RIGHT"), false);
  `);
});

test("Disarm targets each of eight directions individually without damage or explosion", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.x = 4; p.y = 4;
    surroundingTiles(p).forEach((tile, i) => { tile.type = "mine"; tile.revealed = i % 2 === 0; });
    tileAt(6, 4).type = "mine";
    for (const [name, dir] of Object.entries(DIRS)) {
      const before = bombCounts().remaining;
      executeAction(p, {action: "DISARM", dir: name});
      assert.equal(bombCounts().remaining, before - 1);
      assert.equal(tileAt(p.x + dir.dx, p.y + dir.dy).type, "safe");
    }
    surroundingTiles(p).forEach(tile => {
      assert.equal(tile.type, "safe"); assert.equal(tile.revealed, true); assert.equal(tile.exploded, false);
    });
    assert.equal(tileAt(6, 4).type, "mine");
    assert.equal(p.hp, state.config.startingHp); assert.equal(p.alive, true); assert.equal(p.dodge, false);
    assert.match(state.log, /disarms 1 bomb/);
  `);
});

test("Disarm clips at corners and preserves terrain, unexplored safe tiles, and craters", () => {
  const {run} = game();
  run(`
    const p = state.players[0];
    tileAt(1, 0).type = "wall"; tileAt(0, 1).type = "ridge"; tileAt(1, 1).type = "mine";
    executeAction(p, {action: "DISARM", dir: "DOWN_RIGHT"});
    assert.equal(tileAt(1, 0).type, "wall"); assert.equal(tileAt(0, 1).type, "ridge");
    assert.equal(tileAt(1, 1).type, "safe"); assert.equal(tileAt(1, 1).exploded, false);
    assert.match(state.log, /disarms 1 bomb/);
    tileAt(1, 0).type = "safe"; tileAt(1, 0).revealed = false;
    tileAt(0, 1).type = "safe"; tileAt(0, 1).exploded = true;
    executeAction(p, {action: "DISARM", dir: "DOWN"});
    assert.equal(tileAt(1, 0).revealed, false); assert.equal(tileAt(0, 1).exploded, true);
    assert.match(state.log, /no bomb/);
  `);
});

test("Queued Disarm uses the player's position after movement and records the outcome", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.x = 3; p.y = 3;
    p.program = [{action: "MOVE", dir: "RIGHT"}, {action: "DISARM", dir: "DOWN_RIGHT"}];
    state.players.slice(1).forEach(other => other.program = [{action: "DISCARD", dir: null}]);
    tileAt(5, 4).type = "mine"; tileAt(2, 3).type = "mine";
    beginExecution();
    for (let i = 0; i < 4; i++) resolveNext();
    assert.equal(p.x, 4); assert.equal(tileAt(5, 4).type, "safe");
    assert.equal(tileAt(2, 3).type, "mine"); assert.equal(p.hp, state.config.startingHp);
    assert.match(state.queue[3].resultLog, /disarms 1 bomb/);
    assert.equal(state.queue[3].eventType, null);
  `);
});

test("Resolve Remaining applies Disarm, while an eliminated player's Disarm is skipped", () => {
  const {run} = game();
  run(`
    state.players.forEach(p => p.program = [{action: "DISARM", dir: "LEFT"}]);
    tileAt(1, 0).type = "mine"; tileAt(8, 9).type = "mine";
    beginExecution();
    state.players[0].alive = false; state.players[0].hp = 0;
    resolveAll();
    assert.equal(tileAt(1, 0).type, "mine"); assert.equal(tileAt(8, 9).type, "safe");
    assert.equal(state.phase, "rolling"); assert.equal(state.round, 2);
  `);
});

test("Setup normalization preserves zero terrain and clamps values to board capacity", () => {
  const {run, elements} = game({terrainType: "random", terrainCount: "0", ridgeCount: "0"});
  run(`
    startGame();
    assert.equal(state.config.wallCount, 0);
    assert.equal(state.config.ridgeLines, 0);
    assert.equal(state.board.some(isBlockingTerrain), false);
  `);
  for (const [id, value] of Object.entries({playerCount: "99", startingHp: "invalid", terrainCount: "50", ridgeCount: "10", bombPercent: "99"})) {
    elements.get(id).value = value;
  }
  run(`
    startGame();
    assert.equal(state.players.length, 6);
    assert.equal(state.config.startingHp, 5);
    assert.equal(state.config.wallCount, 20);
    assert.equal(state.config.ridgeLines, 2);
    assert.equal(state.config.bombPercent, 64);
    assert.equal(state.board.filter(tile => tile.type === "wall").length, 20);
    assert.equal(state.board.filter(tile => tile.type === "ridge").length, 10);
    assert.equal(state.board.filter(tile => tile.type === "mine").length, 64);
    state.players.forEach(p => {
      assert.equal(tileAt(p.x, p.y).type, "safe");
      assert.equal(tileAt(p.x, p.y).revealed, true);
    });
  `);
  assert.equal(elements.get("mapSummary").textContent, "64 hidden bombs · 20 walls · 2 long ridges");
});

test("Movement previews do not reveal bombs or depend on other players' current occupancy", () => {
  const {run} = game();
  run(`
    const p = state.players[0]; p.pointsRemaining = 6;
    tileAt(2, 1).type = "wall"; tileAt(1, 2).type = "ridge";
    const before = JSON.stringify([...movementPaths(p)]);
    state.board.forEach(tile => {
      if (!isBlockingTerrain(tile)) { tile.type = "mine"; tile.revealed = false; }
    });
    state.players[1].x = 1; state.players[1].y = 0;
    assert.equal(JSON.stringify([...movementPaths(p)]), before);
    assert.equal(state.board.some(tile => tile.revealed), false);
    assert.equal(canEnter(1, 0, p.id), false);
  `);
});

test("Board cells and handlers are reused without retaining old tokens, highlights, or boards", () => {
  const {run, elements, button} = game();
  const cells = [...elements.get("board").children];
  const click = cells[1].listeners.click;
  run("renderBoard(); renderBoard();");
  cells.forEach((cell, index) => assert.equal(elements.get("board").children[index], cell));
  assert.equal(cells[1].listeners.click, click);
  assert.equal(cells[0].children.length, 1);
  assert.equal(cells[0].children[0].children.length, 1);
  run("Math.random = () => 0.5; completeDicePhase();");
  button("MOVE").click();
  cells[1].click();
  assert.equal(cells[1].classList.contains("selected-target"), true);
  button("SCAN").click();
  assert.equal(cells[1].classList.contains("selected-target"), false);
  assert.equal(cells[1].title, "");
  elements.get("newGameBtn").click();
  cells[1].click();
  run("assert.equal(state, null);");
  elements.get("startGameBtn").click();
  run('state.board = makeBoard(); tileAt(1, 0).type = "ridge"; Math.random = () => 0.5; completeDicePhase();');
  assert.equal(elements.get("board").children[1], cells[1]);
  button("BOMB").click();
  cells[1].click();
  assert.equal(cells[1].classList.contains("denied-target"), true);
  assert.equal(elements.get("confirmProgramBtn").disabled, true);
  run("assert.equal(selection.target, null);");
});

test("An earlier denial timer cannot erase a later click's feedback", () => {
  const {run, timers} = game();
  run('Date.now = () => 42; denyBoardTile(tileAt(1, 0), "first"); denyBoardTile(tileAt(2, 0), "second");');
  assert.equal(timers.length, 2);
  timers[0]();
  run('assert.equal(deniedTile.key, "2,0");');
  timers[1]();
  run("assert.equal(deniedTile, null);");
});

test("Directional scans reject clipped regions while Scan Here counts corner neighbors", () => {
  const {run, elements, button} = game();
  run('tileAt(1, 0).type = "mine"; Math.random = () => 0.9; completeDicePhase();');
  for (const action of ["TRI_SCAN", "AREA_SCAN"]) {
    button(action).click();
    run("selectBoardTile(tileAt(1, 0));");
    assert.equal(elements.get("confirmProgramBtn").disabled, true);
    run(`executeAction(state.players[0], {action: "${action}", dir: "RIGHT"});`);
    run('assert.equal(tileAt(1, 0).revealed, false); assert.match(state.log, /beyond the board/);');
  }
  button("SCAN").click();
  assert.equal(elements.get("board").children.filter(tile => tile.classList.contains("scan-region")).length, 1);
  run('executeAction(state.players[0], {action: "SCAN"}); assert.equal(tileAt(1, 0).revealed, false); assert.equal(tileAt(0, 0).clueCount, 1);');
});

test("Single-step and batch resolution agree on damage, skipped players, and early victory", () => {
  const stepped = game();
  const batched = game();
  const configure = `
    state.players[0].x = 2; state.players[0].y = 2;
    state.players[1].x = 3; state.players[1].y = 2; state.players[1].hp = 1;
    state.players[2].x = 7; state.players[2].y = 7; state.players[2].hp = 1;
    tileAt(4, 2).type = "mine"; tileAt(8, 7).type = "mine";
    state.players[0].program = [{action: "ATTACK", dir: "RIGHT"}, {action: "DISCARD"}, {action: "DISCARD"}];
    state.players[1].program = [{action: "DODGE"}];
    state.players[2].program = [{action: "DISCARD"}, {action: "MOVE", dir: "RIGHT"}, {action: "BOMB", dir: "DOWN"}];
    beginExecution();
  `;
  stepped.run(configure);
  batched.run(configure);
  stepped.run('while (state.phase === "execution" && state.executionIndex < state.queue.length) resolveNext();');
  batched.run("resolveAll();");
  assert.equal(stepped.run("JSON.stringify(state)"), batched.run("JSON.stringify(state)"));
  stepped.run(`
    assert.equal(state.phase, "winner");
    assert.equal(state.executionIndex, 5);
    assert.equal(state.queue[0].eventType, "eliminated");
    assert.match(state.queue[1].resultLog, /action is skipped/);
    assert.equal(state.queue[5].done, false);
    assert.equal(state.players[0].alive, true);
  `);
});

test("Batch resolution starts the same next round as individual resolution and ignores planning", () => {
  const stepped = game();
  const batched = game();
  const configure = `
    state.players[0].program = [{action: "BOMB", dir: "RIGHT"}, {action: "DISARM", dir: "RIGHT"}];
    state.players[1].program = [{action: "SCAN"}];
    state.players[2].program = [{action: "DODGE", dir: "DOWN"}, {action: "MOVE", dir: "DOWN"}];
    beginExecution();
  `;
  stepped.run(configure);
  batched.run(configure);
  stepped.run("while (state.executionIndex < state.queue.length) resolveNext(); finishRound();");
  batched.run("resolveAll();");
  assert.equal(stepped.run("JSON.stringify(state)"), batched.run("JSON.stringify(state)"));
  const snapshot = batched.run("JSON.stringify(state)");
  batched.run("resolveAll();");
  assert.equal(batched.run("JSON.stringify(state)"), snapshot);
  batched.run('assert.equal(state.phase, "rolling"); assert.equal(state.round, 2);');
});

test("Execution queue exposes only resolved actions and keeps the next action hidden", () => {
  const {run, elements} = game();
  run(`
    state.players[0].program = [{action: "SCAN"}, {action: "BOMB", dir: "RIGHT"}];
    state.players[1].program = [{action: "DODGE"}];
    state.players[2].program = [{action: "DISARM"}];
    beginExecution();
    assert.deepEqual(state.queue.map(item => item.playerId), [1, 2, 3, 1]);
  `);
  assert.equal(elements.get("executionQueue").children.length, 1);
  assert.equal(elements.get("executionQueue").children[0].textContent, "Next · Player 1 · Hidden action");
  run("resolveNext();");
  const rows = elements.get("executionQueue").children;
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Scan Here/);
  assert.equal(rows[1].textContent, "Next · Player 2 · Hidden action");
  assert.doesNotMatch(elements.get("executionQueue").textContent, /Bomb|Disarm|Dodge/);
});
