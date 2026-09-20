// Reproducible engine audit, not a browser or a human balance study.
// Usage: node tests/audit-simulation.js [matches-per-level=5] [round-cap=60] [output-name=audit-results.json]
const fs = require("node:fs");
const path = require("node:path");
const {game} = require("./helpers");
const settle = () => new Promise(resolve => setImmediate(resolve));
const count = Number(process.argv[2] || 5);
const cap = Number(process.argv[3] || 60);
const outputName = path.basename(process.argv[4] || "audit-results.json");

async function simulate(level, seed) {
  const {run, timers} = game({playerCount: "4", humanCount: "all", startingHp: "5",
    terrainCount: "16", bombPercent: "20", turnOrderMode: "random", visibilityMode: "default"});
  run(`
    let auditSeed = ${seed};
    Math.random = () => {
      auditSeed = (Math.imul(auditSeed, 1664525) + 1013904223) >>> 0;
      return auditSeed / 4294967296;
    };
    startGame();
    state.players.forEach(p => p.controller = ${JSON.stringify(level)});
    globalThis.audit = {actions: {}, damage: 0, planted: 0, disarmed: 0, pushes: 0,
      ineffective: 0, lastDamageRound: 0, maxQuietRounds: 0, agentFailures: 0, rounds: []};
    const originalExecute = executeAction;
    executeAction = (p, item) => {
      const beforeHp = state.players.reduce((n, p) => n + p.hp, 0);
      const beforeMines = bombCounts().remaining;
      const beforeState = JSON.stringify([state.board, state.players.map(({x,y,hp,alive,dodge}) => ({x,y,hp,alive,dodge}))]);
      originalExecute(p, item);
      audit.actions[item.action] = (audit.actions[item.action] || 0) + 1;
      const damage = beforeHp - state.players.reduce((n, p) => n + p.hp, 0);
      if (damage) { audit.damage += damage; audit.lastDamageRound = state.round; }
      if (item.action === "BOMB") audit.planted += Math.max(0, bombCounts().remaining - beforeMines);
      if (item.action === "DISARM") audit.disarmed += beforeMines - bombCounts().remaining;
      if (item.action === "ATTACK" && state.log.includes("pushes")) audit.pushes++;
      if (beforeState === JSON.stringify([state.board, state.players.map(({x,y,hp,alive,dodge}) => ({x,y,hp,alive,dodge}))])) audit.ineffective++;
      const positions = new Set();
      for (const player of state.players) {
        assert.equal(player.alive, player.hp > 0);
        assert.ok(player.hp >= 0 && player.hp <= state.config.startingHp);
        assert.ok(inBounds(player.x, player.y));
        if (!player.alive) continue;
        assert.ok(!isBlockingTerrain(tileAt(player.x, player.y)));
        const key = tileKey(player.x, player.y);
        assert.ok(!positions.has(key), "Living players overlap");
        positions.add(key);
      }
      for (const t of state.board) {
        if (t.scannedInitialMine) assert.ok(t.initialMine && t.type === "mine" && t.revealed);
      }
    };
  `);
  for (let round = 1; round <= cap; round++) {
    run("assert.equal(state.phase, 'rolling'); completeDicePhase();");
    await settle();
    run(`{
      assert.equal(state.phase, "execution");
      audit.agentFailures += state.agentFailures.size;
      for (const p of livingPlayers()) {
        assert.equal(p.pointsRemaining, 0);
        assert.equal(p.program.reduce((n, a) => n + ACTIONS[a.action].cost, 0), p.roll);
      }
      const playedRound = state.round;
      resolveAll();
      audit.maxQuietRounds = Math.max(audit.maxQuietRounds, playedRound - audit.lastDamageRound);
      audit.rounds.push({round: playedRound, hp: state.players.map(p => p.hp), mines: bombCounts().remaining});
    }`);
    // All bot timeouts and dice timers are cancelled; release recorded callbacks.
    timers.forEach((callback, i) => { if (!callback) timers[i] = null; });
    if (run("state.phase === 'winner'")) break;
  }
  return JSON.parse(run(`JSON.stringify({level: ${JSON.stringify(level)}, seed: ${seed},
    finished: state.phase === "winner", roundsPlayed: audit.rounds.length,
    survivors: livingPlayers().map(p => ({id:p.id,hp:p.hp})), mines: bombCounts().remaining,
    order: state.turnOrder, ...audit})`));
}

(async () => {
  const matches = [];
  for (const level of ["new-player", "moderate", "expert"]) {
    for (let seed = 1; seed <= count; seed++) {
      const match = await simulate(level, seed);
      matches.push(match);
      console.log(JSON.stringify({...match, rounds: undefined}));
    }
  }
  fs.writeFileSync(path.join(__dirname, outputName), JSON.stringify({cap, matches}, null, 2) + "\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
