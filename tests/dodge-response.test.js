const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

for (const order of [[1, 2, 3], [2, 1, 3]]) {
  test(`Same-step Dodge protects either turn order: ${order}`, () => {
    const {run, elements} = game();
    run(`
      const [p, target] = state.players;
      p.x = 4; p.y = 4; target.x = 5; target.y = 4;
      state.turnOrder = [${order}];
      p.program = [{action: "ATTACK", dir: "RIGHT"}];
      target.program = [{action: "DODGE", dir: "DOWN"}, {action: "MOVE", dir: "RIGHT"}];
      beginExecution(); resolveNext(); resolveNext();
      assert.equal(target.x, 5); assert.equal(target.y, 5);
      assert.equal(target.hp, 3); assert.equal(target.dodge, false);
      assert.match(state.queue.find(i => i.action === "ATTACK").resultLog, /Player 2 dodges Player 1/);
      resolveNext(); assert.equal(target.x, 6); assert.equal(target.y, 5);
    `);
    assert.match(elements.get("executionQueue").textContent, /Player 1 attacks Player 2; waiting/);
    assert.match(elements.get("executionQueue").textContent, /Player 2 dodges Player 1/);
  });
}

test("A later-step Dodge cannot defend an earlier attack", () => {
  const {run, elements} = game();
  run(`
    const [p, target] = state.players;
    p.x = 4; p.y = 4; target.x = 5; target.y = 4;
    tileAt(6, 4).type = "wall";
    p.program = [{action: "ATTACK", dir: "RIGHT"}];
    target.program = [{action: "DISCARD"}, {action: "DODGE", dir: "DOWN"}];
    beginExecution(); resolveNext();
    assert.equal(target.hp, 2); assert.equal(target.y, 4);
    assert.equal(state.queue[2].dodgeConsumed, undefined);
  `);
  assert.match(elements.get("executionQueue").textContent, /did not choose an available dodge/);
  assert.match(elements.get("executionQueue").textContent, /1 HP damage/);
  assert.doesNotMatch(elements.get("executionQueue").textContent, /Dodge ↓/);
});

test("A blocked same-step Dodge is consumed and cannot protect against another attack", () => {
  const {run} = game();
  run(`
    const [p, target, other] = state.players;
    p.x = 4; p.y = 4; target.x = 5; target.y = 4; other.x = 5; other.y = 3;
    tileAt(5, 5).type = "wall"; tileAt(6, 4).type = "wall";
    state.turnOrder = [1, 3, 2];
    p.program = [{action: "ATTACK", dir: "RIGHT"}];
    other.program = [{action: "ATTACK", dir: "DOWN"}];
    target.program = [{action: "DODGE", dir: "DOWN"}];
    beginExecution(); resolveNext();
    assert.equal(target.hp, 2); assert.match(state.log, /dodge fails/);
    resolveNext(); assert.equal(target.hp, 1);
    resolveNext(); assert.equal(target.dodge, false);
    assert.match(state.log, /already spent/);
  `);
});

test("Reactive Dodge still triggers destination bombs and batch execution agrees", () => {
  for (const batch of [false, true]) {
    const {run} = game();
    run(`
      const [p, target] = state.players;
      p.x = 4; p.y = 4; target.x = 5; target.y = 4;
      tileAt(5, 5).type = "mine";
      p.program = [{action: "ATTACK", dir: "RIGHT"}];
      target.program = [{action: "DODGE", dir: "DOWN"}];
      beginExecution();
      ${batch ? 'resolveAll();' : 'resolveNext(); resolveNext();'}
      assert.equal(target.x, 5); assert.equal(target.y, 5);
      assert.equal(target.hp, 2); assert.equal(target.dodge, false);
      assert.equal(tileAt(5, 5).type, "safe");
    `);
  }
});
