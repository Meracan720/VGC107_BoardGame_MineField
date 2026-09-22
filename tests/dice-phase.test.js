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

test("All players roll publicly in playing order before planning can start", () => {
  const {run, elements} = game({playerCount: "4"});
  run(`
    state.turnOrder = [3, 1, 4, 2]; DicePhase.begin();
    globalThis.rolls = [0.2, 0.99, 0.7, 0.4];
    Math.random = () => rolls.shift();
    DicePhase.startPlanning(); chooseAction("DODGE"); confirmProgram();
    assert.equal(state.phase, "rolling");
    assert.ok(state.players.every(p => p.roll === null && p.program.length === 0));
  `);
  assert.equal(elements.get("planningControls").classList.contains("hidden"), true);
  assert.equal(elements.get("beginPlanningBtn").disabled, true);
  for (const [i, id] of [3, 1, 4, 2].entries()) {
    run(`assert.equal(DicePhase.current().id, ${id});`);
    elements.get("rollDiceBtn").click();
    assert.deepEqual(elements.get("roundDice").children.map(column => column.children[1].textContent),
      [2, 6, 5, 3].map((value, index) => index <= i ? String(value) : "—"));
    assert.equal(elements.get("beginPlanningBtn").disabled, i !== 3);
  }
  assert.deepEqual(elements.get("roundDice").children.map(column => column.children[0].textContent), ["P3", "P1", "P4", "P2"]);
  run('assert.equal(state.phase, "rolling"); assert.equal(DicePhase.current(), null);');
  elements.get("beginPlanningBtn").click();
  run('assert.equal(state.phase, "planning"); assert.equal(currentPlanner().id, 3); assert.equal(currentPlanner().pointsRemaining, 2);');
  assert.equal(elements.get("planningControls").classList.contains("hidden"), false);
});

for (const count of [7, 8]) {
  test(`${count} players spawn safely and participate in dice, planning, and execution`, () => {
    const {run, elements} = game({playerCount: String(count)});
    run(`
      startGame();
      assert.equal(state.players.length, ${count});
      assert.equal(new Set(state.players.map(p => p.x + "," + p.y)).size, ${count});
      state.players.forEach(p => {
        assert.equal(tileAt(p.x, p.y).type, "safe");
        assert.equal(tileAt(p.x, p.y).revealed, true);
      });
      Math.random = () => 0;
      completeDicePhase();
      assert.ok(state.players.every(p => p.roll === 1));
      for (let id = 1; id <= ${count}; id++) {
        assert.equal(currentPlanner().id, id);
        chooseAction("DISCARD"); confirmProgram(); readyNextPlayer();
      }
      assert.equal(state.phase, "execution");
      assert.deepEqual(state.queue.map(item => item.playerId), state.turnOrder);
    `);
    assert.equal(elements.get("roundDice").children.length, count);
    assert.equal(elements.get("playerList").children.length, count);
    assert.equal(elements.get("executionRolls").children.length, count);
    run('resolveAll(); assert.equal(state.round, 2); assert.equal(state.phase, "rolling");');
  });
}

test("Eight seats support seven humans and one bot", () => {
  const {run} = game({playerCount: "8", humanCount: "7"});
  run(`
    assert.equal(state.config.humanCount, 7);
    assert.equal(state.players.filter(p => !GameAgents.isBot(p)).length, 7);
    assert.equal(state.players[7].name, "Bot 8");
    assert.equal(GameAgents.isBot(state.players[7]), true);
  `);
});

test("Planning keeps assigned rolls and public cubes while programs stay private", () => {
  const {run, elements} = game();
  run('Math.random = () => 0.4; completeDicePhase(); globalThis.before = state.players.map(p => p.roll);');
  run('rollDice(); chooseAction("DODGE"); confirmProgram(); assert.deepEqual(state.players.map(p => p.roll), before);');
  assert.deepEqual(elements.get("roundDice").children.map(column => column.children[1].textContent), ["3", "3", "3"]);
  assert.doesNotMatch(elements.get("roundDice").textContent, /Dodge|Move|Scan/);
  run(`
    chooseAction("DISCARD"); confirmProgram(); readyNextPlayer();
    assert.equal(currentPlanner().id, 2);
    assert.equal(currentPlanner().roll, 3);
    assert.equal(currentPlanner().pointsRemaining, 3);
    rollDice(); assert.deepEqual(state.players.map(p => p.roll), before);
  `);
});

test("Bots automatically roll in sequence and reuse those points for planning", async () => {
  const {run, elements, timers} = game({humanCount: "1"});
  run('state.turnOrder = [2, 1, 3]; Math.random = () => 0.5; DicePhase.begin();');
  assert.equal(elements.get("rollDiceBtn").disabled, true);
  timers.find(callback => callback)();
  run('assert.equal(state.players[1].roll, 4); assert.equal(DicePhase.current().id, 1);');
  assert.equal(elements.get("rollDiceBtn").disabled, false);
  elements.get("rollDiceBtn").click();
  // The last scheduled timer is Bot 3's roll (the first timer has already fired).
  timers.at(-1)();
  run('assert.equal(state.players[2].roll, 4); assert.equal(state.phase, "rolling"); assert.equal(DicePhase.current(), null); Math.random = () => 0;');
  elements.get("beginPlanningBtn").click();
  await settle();
  run(`
    assert.equal(state.players[1].roll, 4);
    assert.equal(state.players[1].program.reduce((sum, a) => sum + ACTIONS[a.action].cost, 0), 4);
    assert.equal(currentPlanner().id, 1);
    chooseAction("DISCARD"); confirmProgram();
  `);
  await settle();
  run('assert.equal(state.phase, "execution"); assert.ok(state.players.every(p => p.roll === 4));');
});

test("Next round clears rolls and skips eliminated players in the dice sequence", () => {
  const {run, elements} = game();
  run(`
    Math.random = () => 0; completeDicePhase();
    state.players[0].alive = false; state.players[0].hp = 0;
    finishRound();
    assert.equal(state.phase, "rolling");
    assert.equal(state.round, 2);
    assert.equal(DicePhase.current().id, 2);
    assert.ok(state.players.every(p => p.roll === null));
    rollDice(); assert.equal(DicePhase.current().id, 3);
    rollDice(); assert.equal(DicePhase.current(), null);
  `);
  assert.deepEqual(elements.get("roundDice").children.map(column => column.children[1].textContent), ["—", "1", "1"]);
  elements.get("beginPlanningBtn").click();
  run('assert.equal(currentPlanner().id, 2); assert.equal(state.phase, "planning");');
});

test("New Game cancels automatic rolls and stale callbacks cannot change the replacement game", () => {
  const {run, timers} = game({humanCount: "1"});
  run('state.turnOrder = [2, 1, 3]; DicePhase.begin();');
  const oldRoll = timers.find(callback => callback);
  run('resetToSetup(); startGame();');
  oldRoll();
  run('assert.ok(state.players.every(p => p.roll === null)); assert.equal(state.round, 1); assert.equal(DicePhase.current().id, 1);');
});
