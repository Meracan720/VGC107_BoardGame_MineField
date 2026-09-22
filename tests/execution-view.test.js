/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

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

test("Collapsed log tracks only the latest result and execution pulse follows the active player", () => {
  const {run, elements} = fixture();
  const pulsing = () => elements.get("playerList").children.filter(c => c.classList.contains("execution-active"));
  assert.equal(elements.get("latestExecutionLog").textContent, "No actions resolved yet.");
  assert.equal(pulsing().length, 1);
  assert.match(pulsing()[0].innerHTML, /Player 3/);
  run('resolveNext();');
  assert.equal(elements.get("latestExecutionLog").textContent, run('state.queue[0].resultLog'));
  assert.match(pulsing()[0].innerHTML, /Player 1/);
  run('resolveNext();');
  assert.equal(elements.get("latestExecutionLog").textContent, run('state.queue[1].resultLog'));
  run('while (state.executionIndex < state.queue.length) resolveNext();');
  assert.equal(pulsing().length, 0);
  run('finishRound();');
  assert.equal(pulsing().length, 0);
  assert.equal(elements.get("latestExecutionLog").textContent, "No actions resolved yet.");
});

test("Empty attacks and unused dodges have hollow movement-colored execution cubes", () => {
  const {run, elements} = game();
  run(`
    state.players[0].roll = 2;
    state.players[0].program = [{action: "ATTACK", dir: "RIGHT"}, {action: "DODGE", dir: "DOWN"}];
    beginExecution();
  `);
  const cube = row => elements.get("executionPoints").children[row].children[0].children[0];
  assert.equal(cube(0).classList.contains("point-empty"), false);
  run('resolveNext();');
  assert.ok(cube(0).classList.contains("point-empty"));
  assert.equal(cube(1).classList.contains("point-empty"), false);
  run('resolveNext();');
  assert.ok(cube(1).classList.contains("point-empty"));
});

for (const order of [[1, 2, 3], [2, 1, 3]]) {
  test(`Triggered Dodge gains its filled color, with turn order ${order}`, () => {
    const {run, elements} = game();
    run(`
      const [attacker, defender] = state.players;
      attacker.x = 4; attacker.y = 4; defender.x = 5; defender.y = 4;
      attacker.roll = defender.roll = 1;
      attacker.program = [{action: "ATTACK", dir: "RIGHT"}];
      defender.program = [{action: "DODGE", dir: "DOWN"}];
      state.turnOrder = [${order}]; beginExecution(); resolveNext();
    `);
    const cubes = () => elements.get("executionPoints").children[0].children.map(c => c.children[0]);
    if (order[0] === 2) assert.ok(cubes()[0].classList.contains("point-empty"));
    run('resolveNext();');
    assert.ok(cubes().slice(0, 2).every(c => !c.classList.contains("point-empty")));
    assert.ok(cubes()[order.indexOf(2)].classList.contains("point-dodge"));
  });
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
  const deadDie = elements.get("roundDice").children.find(column => column.children[0].textContent === "P3");
  assert.ok(deadDie.classList.contains("dead"));
  assert.equal(deadDie.children[1].textContent, "DEAD");
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
