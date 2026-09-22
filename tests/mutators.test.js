const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

function selectMode(elements, id) {
  const inputs = elements.get("mutatorList").children.map(label => label.children[0]);
  inputs.forEach(input => { input.checked = input.value === id; });
  const selected = inputs.find(input => input.checked);
  assert.ok(selected, `Missing mutator ${id}`);
  selected.listeners.change();
}

test("Eight-player mutator retains selected settings, updates setup, and persists on New Game", () => {
  const {run, elements} = game({playerCount: "4", humanCount: "2", startingHp: "7",
    botDifficulty: "expert", visibilityMode: "hard", terrainCount: "10", bombPercent: "30"});
  selectMode(elements, "last-survivor-8");
  assert.equal(elements.get("playerCount").value, 8);
  assert.equal(elements.get("playerCount").disabled, true);
  assert.equal(elements.get("manualTurnOrder").children.length, 8);
  run(`
    startGame();
    assert.equal(state.config.mutatorId, "last-survivor-8");
    assert.equal(state.players.length, 8);
    assert.equal(state.config.humanCount, 2);
    assert.equal(state.config.botDifficulty, "expert");
    assert.equal(state.config.startingHp, 7);
    assert.equal(state.config.visibilityMode, "hard");
    assert.equal(state.config.wallCount, 10);
    assert.equal(state.config.bombPercent, 30);
    assert.equal(state.config.turnOrderMode, "manual");
    assert.equal(new Set(state.players.map(p => p.x + "," + p.y)).size, 8);
    resetToSetup(); startGame();
    assert.equal(state.config.mutatorId, "last-survivor-8");
    assert.equal(state.players.length, 8);
  `);
  selectMode(elements, "last-survivor");
  assert.equal(elements.get("playerCount").disabled, false);
  elements.get("playerCount").value = "3";
  run('startGame(); assert.equal(state.players.length, 3); assert.equal(state.config.mutatorId, "last-survivor");');
});

test("Eight-player constraints apply before capacity calculations and cannot be bypassed at start", () => {
  const {run, elements} = game({playerCount: "3", terrainType: "random", terrainCount: "20", ridgeCount: "2", bombPercent: "67"});
  selectMode(elements, "last-survivor-8");
  assert.equal(elements.get("bombPercent").max, 62);
  assert.equal(elements.get("mapSummary").textContent, "62 hidden bombs · 20 walls · 2 long ridges");
  elements.get("playerCount").value = "4";
  run(`
    startGame();
    assert.equal(state.players.length, 8);
    assert.equal(state.config.bombCount, 62);
    assert.equal(state.board.filter(t => t.type === "mine").length, 62);
  `);
});

test("Eight-player mutator keeps Last Survivor and bomb-clearance victory rules", () => {
  const {run, elements} = game();
  selectMode(elements, "last-survivor-8");
  run(`
    startGame();
    const mode = GameMutators.get(state.config.mutatorId);
    assert.equal(mode.getResult(state), null);
    state.players.forEach(p => { p.alive = p.id === 8; });
    assert.equal(mode.getResult(state).title, "Player 8 Wins!");
    state.players[7].alive = false;
    assert.equal(mode.getResult(state).title, "No Survivors");
    state.players.forEach(p => { p.alive = true; p.hp = p.id >= 7 ? 5 : 3; });
    state.board.forEach(t => { t.type = "safe"; });
    assert.equal(mode.getResult(state).title, "Player 7 & Player 8 Share Victory!");
  `);
});
