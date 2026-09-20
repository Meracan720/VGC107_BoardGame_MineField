const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

function fixture() {
  const harness = game({playerCount: "4"});
  harness.run(`
    state.turnOrder = [3, 1, 4, 2];
    state.players.forEach((p, i) => p.roll = [3, 1, 6, 2][i]);
    state.players[0].program = [{action: "TRI_SCAN", dir: "DOWN_RIGHT"}, {action: "DODGE", dir: "DOWN"}];
    state.players[1].program = [{action: "DISCARD"}];
    tileAt(9,1).type = "wall";
    state.players[2].program = [{action: "BREAK_WALL", dir: "DOWN"}, {action: "TRI_SCAN", dir: "DOWN_LEFT"}, {action: "DODGE", dir: "LEFT"}, {action: "DISARM", dir: "DOWN"}];
    state.players[3].program = [{action: "DISCARD"}, {action: "DISCARD"}];
    beginExecution();
  `);
  return harness;
}

test("Execution columns follow playing order with exactly one pending slot per die point", () => {
  const {elements} = fixture();
  const headers = elements.get("executionRolls").children;
  const rows = elements.get("executionPoints").children;
  assert.deepEqual(headers.map(h => h.children[0].textContent), ["P3", "P1", "P4", "P2"]);
  assert.equal(rows.length, 6);
  assert.ok(rows.every(row => row.children.length === 4));
  assert.deepEqual(headers.map((_, i) => rows.filter(row => row.children[i].textContent === "*").length), [6, 3, 2, 1]);
  assert.equal(elements.get("mainGrid").classList.contains("executing"), false);
  assert.ok(rows[0].children.every(cell => cell.children[0].classList.contains("allocation-cell")));
  assert.ok(rows[0].children.every(cell => cell.children[0].classList.contains("usable")));
  assert.equal(rows[5].children[1].children.length, 0);
  const visible = rows.flatMap(row => row.children).map(cell => cell.title + cell.textContent).join(" ");
  assert.doesNotMatch(visible, /Bomb|Scan|Dodge|Disarm/);
  assert.deepEqual(headers.filter(h => h.classList.contains("executing-player")).map(h => h.children[0].textContent), ["P3"]);
});

test("Resolving a two-point action completes two slots and transfers the blue column to the next player", () => {
  const {run, elements} = fixture();
  run("resolveNext();");
  const rows = elements.get("executionPoints").children;
  assert.equal(rows[0].children[0].textContent, "");
  assert.equal(rows[1].children[0].textContent, "");
  assert.equal(rows[2].children[0].textContent, "*");
  assert.match(rows[0].children[0].title, /Break Wall/);
  assert.ok(rows[0].children[0].children[0].classList.contains("point-bomb"));
  assert.ok(rows[1].children[0].children[0].classList.contains("point-bomb"));
  assert.ok(rows[2].children[0].children[0].classList.contains("usable"));
  assert.doesNotMatch(rows[2].children[0].title, /Scan/);
  const headers = elements.get("executionRolls").children;
  assert.deepEqual(headers.filter(h => h.classList.contains("executing-player")).map(h => h.children[0].textContent), ["P1"]);
  assert.ok(rows.slice(0, 3).every(row => row.children[1].classList.contains("executing-player")));
  assert.ok(rows.slice(3).every(row => !row.children[1].classList.contains("executing-player")));
  assert.ok(rows[2].children[1].classList.contains("last-point"));
  assert.match(elements.get("executionProgress").textContent, /Next: Player 1/);
});

test("No column blinks for an elimination skip or a finished queue; the table clears for planning", () => {
  const {run, elements} = fixture();
  run("state.players[2].alive = false; render();");
  assert.equal(elements.get("executionRolls").children.some(h => h.classList.contains("executing-player")), false);
  assert.match(elements.get("executionProgress").textContent, /skip an eliminated/);
  run('while (state.executionIndex < state.queue.length) resolveNext();');
  assert.equal(elements.get("executionRolls").children.some(h => h.classList.contains("executing-player")), false);
  assert.equal(elements.get("executionPoints").children.flatMap(row => row.children).filter(c => c.textContent === "*").length, 0);
  assert.match(elements.get("executionProgress").textContent, /All actions resolved/);
  run("finishRound();");
  assert.equal(elements.get("executionPoints").children.length, 0);
  assert.equal(elements.get("executionRolls").children.length, 0);
  assert.equal(elements.get("mainGrid").classList.contains("executing"), false);
});
