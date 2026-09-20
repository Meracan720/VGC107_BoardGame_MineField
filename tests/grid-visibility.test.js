const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

for (const mode of ["clear", "default", "hard"]) {
  test(`${mode}: clue snapshots expire by mode and never reveal scanned bomb contents`, () => {
    const {run, elements} = game({visibilityMode: mode});
    run(`
      placeMines(90);
      const mines = state.board.filter(t => t.type === "mine");
      assert.ok(mines.length > 2);
      globalThis.found = mines[0];
      globalThis.hidden = mines[1];
      revealScanRegion(state.players[0], [found], "test");
      for (let i = 0; i < 5; i++) finishRound();
      assert.equal(found.revealed, false);
      assert.equal(hidden.revealed, false);
      assert.equal(bombCounts().found, 0);
      assert.equal(Number.isInteger(found.clueCount), ${mode === "clear"});
    `);
    const index = run("found.y * SIZE + found.x");
    assert.equal(elements.get("board").children[index].classList.contains("mine"), false);
    assert.equal(elements.get("board").children[index].children.some(c => c.classList.contains("scan-clue")), mode === "clear");
  });
}

for (const action of ["DISARM", "MOVE"]) {
  test(`${action} removes an initial bomb; scanning a replacement does not reveal its contents`, () => {
    const {run, elements} = game({visibilityMode: "hard"});
    run(`
      const tile = tileAt(1, 0);
      tile.type = "mine"; tile.initialMine = true;
      executeAction(state.players[0], {action: "SCAN"});
      assert.equal(tile.scannedInitialMine, false);
      assert.equal(tileAt(0, 0).clueCount, 1);
      executeAction(state.players[0], {action: "${action}", dir: "RIGHT"});
      assert.equal(tile.type, "safe");
      assert.equal(tile.scannedInitialMine, false);
      assert.equal(tile.initialMine, false);
      state.players[0].x = 0;
      finishRound();
      assert.equal(tile.revealed, false);
      executeAction(state.players[0], {action: "BOMB", dir: "RIGHT"});
      executeAction(state.players[0], {action: "TRI_SCAN", dir: "DOWN_RIGHT"});
      assert.equal(tile.revealed, false);
      assert.ok(Number.isInteger(tile.clueCount));
      assert.equal(tile.scannedInitialMine, false);
      finishRound();
      assert.equal(tile.revealed, false);
    `);
    assert.equal(elements.get("board").children[1].classList.contains("found-mine"), false);
  });
}

for (const [mode, rounds] of [["clear", 4], ["default", 2], ["hard", 1]]) {
  test(`${mode} expires safe and mine knowledge independently of tile contents`, () => {
    const {run, elements} = game({visibilityMode: mode});
    run(`
      tileAt(1, 0).type = "mine";
      tileAt(0, 1).type = "wall";
      tileAt(2, 2).type = "ridge";
      GridVisibility.reveal(tileAt(1, 0));
      GridVisibility.reveal(tileAt(1, 1));
      GridVisibility.reveal(tileAt(0, 1));
      GridVisibility.reveal(tileAt(2, 2));
      assert.equal(tileAt(1, 0).lastRevealedRound, 1);
      assert.equal(tileAt(1, 1).lastRevealedRound, 1);
    `);
    for (let elapsed = 1; elapsed <= rounds; elapsed++) {
      run("finishRound();");
      const visible = mode === "clear" || elapsed < rounds;
      run(`
        assert.equal(tileAt(1, 0).revealed, ${visible});
        assert.equal(tileAt(1, 1).revealed, ${visible});
        assert.equal(tileAt(1, 0).type, "mine");
        assert.equal(tileAt(1, 1).type, "safe");
        assert.equal(tileAt(0, 1).revealed, true);
        assert.equal(tileAt(2, 2).revealed, true);
        assert.equal(bombCounts().remaining, 2);
        assert.equal(bombCounts().found, ${visible ? 1 : 0});
      `);
      assert.equal(elements.get("board").children[1].classList.contains("mine"), visible);
      assert.equal(elements.get("board").children[11].classList.contains("safe"), visible);
    }
  });

  test(`${mode} planting preserves both known and unknown grids and their original timers`, () => {
    const {run} = game({visibilityMode: mode});
    run(`
      GridVisibility.reveal(tileAt(1, 0));
      const stamp = tileAt(1, 0).lastRevealedRound;
      const unknownStamp = tileAt(0, 1).lastRevealedRound;
      executeAction(state.players[0], {action: "BOMB", dir: "RIGHT"});
      executeAction(state.players[0], {action: "BOMB", dir: "DOWN"});
      assert.equal(tileAt(1, 0).revealed, true);
      assert.equal(tileAt(0, 1).revealed, false);
      assert.equal(tileAt(1, 0).lastRevealedRound, stamp);
      assert.equal(tileAt(0, 1).lastRevealedRound, unknownStamp);
      assert.equal(bombCounts().remaining, 3);
      assert.equal(bombCounts().found, 1);
      finishRound();
      const stillKnown = tileAt(1, 0).revealed;
      executeAction(state.players[0], {action: "BOMB", dir: "RIGHT"});
      assert.equal(tileAt(1, 0).revealed, stillKnown);
      assert.equal(tileAt(1, 0).lastRevealedRound, stamp);
      finishRound();
      assert.equal(tileAt(1, 0).revealed, ${mode === "clear"});
      assert.equal(tileAt(1, 0).type, "mine");
      assert.equal(tileAt(0, 1).revealed, false);
    `);
  });
}

test("Moving and targeted checks refresh visibility, including a pushed player's destination", () => {
  const {run} = game({visibilityMode: "default"});
  run(`
    executeAction(state.players[0], {action: "DISARM", dir: "DOWN"});
    finishRound();
    executeAction(state.players[0], {action: "MOVE", dir: "RIGHT"});
    assert.equal(tileAt(1, 0).lastRevealedRound, 2);
    finishRound();
    assert.equal(tileAt(1, 0).revealed, true);
    assert.equal(tileAt(0, 1).revealed, false);
    executeAction(state.players[0], {action: "DISARM", dir: "DOWN_LEFT"});
    assert.equal(tileAt(0, 1).revealed, true);
    assert.equal(tileAt(0, 1).lastRevealedRound, 3);
    state.players[1].x = 2; state.players[1].y = 0;
    executeAction(state.players[0], {action: "ATTACK", dir: "RIGHT"});
    assert.equal(tileAt(3, 0).lastRevealedRound, 3);
    finishRound();
    assert.equal(tileAt(1, 0).revealed, false);
    assert.equal(tileAt(0, 1).revealed, true);
    assert.equal(tileAt(3, 0).revealed, true);
  `);
});

test("Hard mode hides exploded/disarmed/demolished grids without changing their physical status", () => {
  const {run, elements} = game({visibilityMode: "hard"});
  run(`
    tileAt(1, 0).type = "mine";
    tileAt(0, 1).type = "wall";
    executeAction(state.players[0], {action: "BOMB", dir: "DOWN"});
    executeAction(state.players[0], {action: "MOVE", dir: "RIGHT"});
    tileAt(2, 0).type = "mine";
    executeAction(state.players[0], {action: "DISARM", dir: "RIGHT"});
    assert.equal(tileAt(0, 1).revealed, true);
    assert.equal(tileAt(1, 0).revealed, true);
    assert.equal(tileAt(2, 0).revealed, true);
    finishRound();
    for (const tile of [tileAt(0, 1), tileAt(1, 0), tileAt(2, 0)]) {
      assert.equal(tile.type, "safe");
      assert.equal(tile.revealed, false);
    }
    assert.equal(tileAt(0, 1).exploded, true);
    assert.equal(tileAt(1, 0).exploded, false);
  `);
  for (const index of [10, 1, 2]) {
    const cell = elements.get("board").children[index];
    assert.equal(cell.classList.contains("safe"), false);
    assert.equal(cell.classList.contains("exploded"), false);
  }
});

test("Visibility setting persists on New Game and resets to Default on a fresh setup", () => {
  const {run, elements} = game({visibilityMode: "hard"});
  run('resetToSetup(); startGame(); assert.equal(state.config.visibilityMode, "hard");');
  elements.get("visibilityMode").value = "clear";
  elements.get("visibilityMode").listeners.change();
  run('resetToSetup(); startGame(); assert.equal(state.config.visibilityMode, "clear");');
  game().run('assert.equal(state.config.visibilityMode, "default");');
});

test("Agents see expired grids as unknown and cannot see hidden crater markers", async () => {
  const {run} = game({humanCount: "1", visibilityMode: "hard"});
  run(`
    MinefieldAgents.register("visibility-observer", {label: "Observer", chooseAction(view) {
      assert.equal(view.visibilityMode, "hard");
      assert.equal(view.board[1].type, "unknown");
      assert.equal(view.board[10].type, "unknown");
      assert.equal(view.board[10].exploded, false);
      assert.equal(view.bombs.found, 0);
      return {action: "DISCARD"};
    }});
    state.players.slice(1).forEach(p => p.controller = "visibility-observer");
    tileAt(1, 0).type = "mine";
    tileAt(0, 1).exploded = true;
    executeAction(state.players[0], {action: "SCAN"});
    finishRound();
    completeDicePhase(); chooseAction("DISCARD"); confirmProgram();
  `);
  await new Promise(resolve => setImmediate(resolve));
  run('assert.equal(state.phase, "execution"); assert.equal(state.agentFailures.size, 0);');
});
