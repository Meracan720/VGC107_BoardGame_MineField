// Diagnostic reproductions of current problems; these assert the observed
// behavior, not the desired behavior. Update/remove after addressing findings.
const assert = require("node:assert/strict");
const {game} = require("./helpers");
const settle = () => new Promise(resolve => setImmediate(resolve));

async function hiddenCrater() {
  const {run} = game({humanCount: "1", visibilityMode: "hard"});
  run(`
    const p = state.players[0]; p.x = 4; p.y = 4;
    tileAt(5,4).type = "wall";
    executeAction(p, {action: "BREAK_WALL", dir: "RIGHT"});
    finishRound();
    assert.equal(tileAt(5,4).revealed, false);
    MinefieldAgents.register("audit-capture", {label: "Capture", chooseAction(view) {
      globalThis.auditView ||= view; return {action: "DISCARD"};
    }});
    p.x = 0; p.y = 0;
    state.players[1].x = 4; state.players[1].y = 4;
    state.players[1].controller = "audit-capture";
    Math.random = () => 0.99;
    completeDicePhase(); chooseAction("DISCARD"); confirmProgram();
  `);
  await settle();
  run(`
    assert.equal(auditView.self.pointsRemaining >= 2, true);
    assert.equal(auditView.board[45].type, "unknown");
    assert.equal(auditView.board[45].exploded, false);
    assert.equal(auditView.board[43].type, "unknown");
    assert.equal(auditView.board[43].exploded, false);
    assert.equal(auditView.legalActions.some(a => a.action === "BOMB" && a.dir === "RIGHT"), false);
    assert.equal(auditView.legalActions.some(a => a.action === "BOMB" && a.dir === "LEFT"), true);
    assert.equal(state.agentFailures.size, 0);
  `);
  console.log("CONFIRMED: unknown crater is redacted in board but disclosed by missing legal BOMB direction.");
}

function lastAllocationUndo() {
  const {run, elements} = game();
  run(`
    Math.random = () => 0; completeDicePhase();
    chooseAction("DODGE"); selectBoardTile(tileAt(1,0)); confirmProgram();
    assert.equal(state.phase, "planning");
    assert.equal(currentPlanner().pointsRemaining, 0);
  `);
  assert.ok(elements.get("planningControls").classList.contains("hidden"));
  assert.ok(!elements.get("passControls").classList.contains("hidden"));
  console.log("CONFIRMED: spending final point hides planning controls, including Undo, before handoff.");
}

async function trappedBeginner() {
  const {run} = game({humanCount: "1", botDifficulty: "new-player"});
  run(`
    const p = state.players[1]; p.x = 9; p.y = 9;
    tileAt(8,9).type = "wall"; tileAt(9,8).type = "wall"; tileAt(8,8).type = "wall";
    Math.random = () => 0.99;
    completeDicePhase(); chooseAction("DISCARD"); confirmProgram();
  `);
  await settle();
  run(`
    assert.equal(state.players[1].program[0].action, "BREAK_WALL");
    assert.equal(state.agentFailures.size, 0);
  `);
  console.log("RESOLVED: boxed-in New Player bot now programs a wall break before other actions.");
}

(async () => {
  await hiddenCrater();
  lastAllocationUndo();
  await trappedBeginner();
})().catch(error => { console.error(error); process.exitCode = 1; });
