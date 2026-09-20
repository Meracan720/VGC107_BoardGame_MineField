/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

const test = require("node:test");
const {game} = require("./helpers");

test("Attacks reach two grids straight and one diagonally in every direction, pushing one grid", () => {
  const {run} = game();
  run(`
    const [p, target] = state.players;
    p.x = 4; p.y = 4;
    for (const [name, dir] of Object.entries(DIRS)) {
      const range = dir.diagonal ? 1 : 2;
      target.x = p.x + dir.dx * range; target.y = p.y + dir.dy * range;
      executeAction(p, {action: "ATTACK", dir: name});
      assert.equal(target.x, p.x + dir.dx * (range + 1));
      assert.equal(target.y, p.y + dir.dy * (range + 1));
      executeAction(p, {action: "ATTACK", dir: name});
      assert.equal(target.x, p.x + dir.dx * (range + 1));
      assert.equal(target.y, p.y + dir.dy * (range + 1));
    }
  `);
});

test("Ranged attacks respect terrain, the nearest player, dodge, and blocked pushes", () => {
  const {run} = game();
  run(`
    const [p, target, other] = state.players;
    p.x = 4; p.y = 4; target.x = 6; target.y = 4;
    for (const terrain of ["wall", "ridge"]) {
      tileAt(5, 4).type = terrain;
      executeAction(p, {action: "ATTACK", dir: "RIGHT"});
      assert.equal(target.x, 6);
    }
    tileAt(5, 4).type = "safe";
    target.dodge = "DOWN";
    executeAction(p, {action: "ATTACK", dir: "RIGHT"});
    assert.equal(target.dodge, false); assert.equal(target.x, 6); assert.equal(target.y, 5);
    target.y = 4;
    other.x = 5; other.y = 4;
    executeAction(p, {action: "ATTACK", dir: "RIGHT"});
    assert.equal(target.x, 6); assert.equal(other.x, 5);
    other.y = 5;
    tileAt(7, 4).type = "mine";
    executeAction(p, {action: "ATTACK", dir: "RIGHT"});
    assert.equal(target.x, 7); assert.equal(target.hp, 2);
    assert.equal(tileAt(7, 4).type, "safe");
  `);
});

test("Board targeting accepts the new attack ranges and rejects beyond-range or obstructed grids", () => {
  const {run} = game();
  run(`
    completeDicePhase();
    const p = currentPlanner(); p.x = 4; p.y = 4; p.pointsRemaining = 6;
    chooseAction("ATTACK");
    for (const [name, dir] of Object.entries(DIRS)) {
      const range = dir.diagonal ? 1 : 2;
      selectBoardTile(tileAt(p.x + dir.dx * range, p.y + dir.dy * range));
      assert.equal(selection.dir, name);
      selectBoardTile(tileAt(p.x + dir.dx * (range + 1), p.y + dir.dy * (range + 1)));
      assert.equal(selection.dir, null);
    }
    selectBoardTile(tileAt(6, 5)); assert.equal(selection.dir, null);
    tileAt(5, 4).type = "wall";
    selectBoardTile(tileAt(6, 4)); assert.equal(selection.dir, null);
    p.program.push({action: "BREAK_WALL", dir: "RIGHT"});
    selectBoardTile(tileAt(6, 4)); assert.equal(selection.dir, "RIGHT");
  `);
});

test("Bots use straight and diagonal reach from the redacted agent observation", async () => {
  const {run} = game({humanCount: "1"});
  run(`
    MinefieldAgents.register("capture-range", {label: "Capture", chooseAction(view) {
      globalThis.sample = view; return {action: "DISCARD"};
    }});
    state.players[1].controller = "capture-range";
    state.players[1].x = 4; state.players[1].y = 4;
    state.players[0].x = 6; state.players[0].y = 4;
    tileAt(7, 4).type = "mine"; tileAt(7, 4).revealed = true;
    completeDicePhase(); chooseAction("DISCARD"); confirmProgram();
  `);
  await new Promise(resolve => setImmediate(resolve));
  run(`
    const right = sample.legalActions.find(a => a.action === "ATTACK" && a.dir === "RIGHT");
    assert.equal(right.region.length, 2);
    for (const level of ["moderate", "expert"]) {
      assert.equal(MinefieldAgents.get(level).chooseAction(sample).dir, "RIGHT");
    }
    sample.players[0].x = 5; sample.players[0].y = 5;
    sample.board[66].type = "mine";
    for (const level of ["moderate", "expert"]) {
      const choice = MinefieldAgents.get(level).chooseAction(sample);
      assert.equal(choice.action, "ATTACK"); assert.equal(choice.dir, "DOWN_RIGHT");
    }
  `);
});
