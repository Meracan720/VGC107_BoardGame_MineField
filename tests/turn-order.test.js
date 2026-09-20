/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");
const settle = () => new Promise(resolve => setImmediate(resolve));
const finishHuman = 'completeDicePhase(); chooseAction("DISCARD"); confirmProgram();';

function selectTurn(elements, index, id) {
  const select = elements.get("manualTurnOrder").children[index].children[1];
  select.value = String(id);
  select.listeners.change();
}

test("Designated controls adapt to 3–6 players and swap seats without duplicates", () => {
  const {run, elements} = game({humanCount: "1", playerCount: "6"});
  selectTurn(elements, 0, 6);
  run('startGame(); assert.deepEqual(state.turnOrder, [6, 2, 3, 4, 5, 1]); resetToSetup();');
  for (const count of [3, 4, 5, 6]) {
    elements.get("playerCount").value = String(count);
    run("updateSetupConfig();");
    const labels = elements.get("manualTurnOrder").children;
    assert.equal(labels.length, count);
    assert.equal(new Set(labels.map(l => l.children[1].value)).size, count);
    assert.ok(labels.every(l => l.children[1].children.length === count));
    assert.equal(labels[0].children[1].children[0].textContent, "Player 1");
    assert.equal(labels[0].children[1].children[1].textContent, "Bot 2");
  }
});

test("Designated order controls planning, queue order, and later rounds without changing seat identities", () => {
  const {run, elements} = game();
  selectTurn(elements, 0, 3);
  selectTurn(elements, 1, 1);
  run(`
    startGame();
    assert.deepEqual(state.turnOrder, [3, 1, 2]);
    assert.equal(currentPlanner().id, 3);
    assert.equal(state.players[0].id, 1);
    assert.equal(state.players[0].x, 0); assert.equal(state.players[0].y, 0);
    assert.equal(state.players[2].id, 3);
    assert.equal(state.players[2].x, 9); assert.equal(state.players[2].y, 0);
    Math.random = () => 0.2;
    ${finishHuman} readyNextPlayer(); assert.equal(currentPlanner().id, 1);
    ${finishHuman} readyNextPlayer(); assert.equal(currentPlanner().id, 2);
    ${finishHuman} readyNextPlayer();
    assert.deepEqual(state.queue.map(a => a.playerId), [3, 1, 2, 3, 1, 2]);
    resolveAll();
    assert.equal(currentPlanner().id, 3);
    assert.deepEqual(state.turnOrder, [3, 1, 2]);
    state.players[2].alive = false;
    finishRound();
    assert.equal(currentPlanner().id, 1);
    assert.deepEqual(livingPlayers().map(p => p.id), [1, 2]);
  `);
  assert.equal(elements.get("turnOrderSummary").textContent, "Playing order: Player 1 → Player 2");
});

test("Random order is sampled once at start and is stable across rounds", () => {
  for (const count of [3, 4, 5, 6]) {
    const {run, elements} = game({playerCount: String(count), turnOrderMode: "random"});
    assert.equal(elements.get("manualTurnOrder").classList.contains("hidden"), true);
    run(`
      Math.random = () => 0;
      startGame();
      assert.deepEqual(state.turnOrder, [${Array.from({length: count - 1}, (_, i) => i + 2).join(",")}, 1]);
      const order = [...state.turnOrder];
      Math.random = () => 0.999;
      updateSetupConfig(); finishRound();
      assert.deepEqual(state.turnOrder, order);
      resetToSetup(); startGame();
      assert.equal(new Set(state.turnOrder).size, ${count});
    `);
  }
});

test("Execution cube headers show rolls in chosen order and clear outside execution", () => {
  const {run, elements} = game();
  selectTurn(elements, 0, 3);
  run('startGame(); state.players.forEach((p, i) => { p.roll = i + 2; p.program = [{action: "DISCARD"}]; }); render();');
  assert.equal(elements.get("executionRolls").textContent, "");
  run("beginExecution();");
  assert.deepEqual(elements.get("executionRolls").children.map(row => row.title), [
    "Player 3 · ⚃ 4", "Player 2 · ⚂ 3", "Player 1 · ⚁ 2",
  ]);
  run("resolveNext();");
  assert.equal(elements.get("executionRolls").children[0].title, "Player 3 · ⚃ 4");
  run("resolveAll();");
  assert.equal(elements.get("executionRolls").textContent, "");
});

test("Elimination keeps this round's roll but never displays an earlier round's roll", () => {
  const {run, elements} = game();
  run('state.players.forEach(p => { p.roll = 6; p.program = [{action: "DISCARD"}]; }); beginExecution(); state.players[1].alive = false; render();');
  assert.equal(elements.get("executionRolls").children[1].title, "Player 2 · ⚅ 6 · Eliminated");
  run('finishRound(); state.players[0].roll = 1; state.players[2].roll = 2; beginExecution();');
  assert.equal(elements.get("executionRolls").children[1].title, "Player 2 · No roll · Eliminated");
});

test("A bot may start a solo game and hand control to the human in designated order", async () => {
  const {run, elements} = game({humanCount: "1"});
  selectTurn(elements, 0, 3);
  selectTurn(elements, 1, 1);
  run("startGame(); completeDicePhase();");
  await settle();
  run('assert.equal(currentPlanner().id, 1); assert.equal(state.awaitingHandoff, false);');
  assert.equal(elements.get("planningControls").classList.contains("hidden"), false);
  assert.equal(elements.get("executionRolls").textContent, "");
  run(finishHuman);
  await settle();
  run('assert.equal(state.phase, "execution"); assert.deepEqual(state.queue.slice(0, 3).map(a => a.playerId), [3, 1, 2]);');
  assert.match(elements.get("executionRolls").children[0].title, /^Bot 3 · [⚀-⚅] [1-6]$/);
});

test("Bots between humans require a handoff before opening the next human's screen", async () => {
  const {run, elements} = game({humanCount: "2"});
  selectTurn(elements, 1, 3);
  run(`startGame(); ${finishHuman}`);
  await settle();
  run('assert.equal(currentPlanner().id, 3); assert.equal(state.awaitingHandoff, true); assert.ok(state.players[1].roll >= 1);');
  assert.equal(elements.get("planningControls").classList.contains("hidden"), true);
  assert.equal(elements.get("passControls").classList.contains("hidden"), false);
  assert.match(elements.get("passMessage").textContent, /Player 2/);
  run(`readyNextPlayer(); assert.equal(currentPlanner().id, 2); ${finishHuman} readyNextPlayer();`);
  run('assert.equal(state.phase, "execution"); assert.deepEqual(state.queue.slice(0, 3).map(a => a.playerId), [1, 3, 2]);');
});
