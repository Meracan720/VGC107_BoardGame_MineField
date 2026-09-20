// Usage: node tests/audit-maps.js [maps-per-configuration=1000]
const {game} = require("./helpers");
const count = Number(process.argv[2] || 1000);
for (const terrain of ["wall", "ridge", "random"]) {
  const {run} = game({playerCount: "6", humanCount: "all", terrainType: terrain,
    terrainCount: "20", ridgeCount: "2", bombPercent: "20"});
  const result = run(`{
    const stats = {terrain: ${JSON.stringify(terrain)}, maps: ${count}, disconnected: 0,
      blockedStarts: 0, examples: []};
    function reachable(start, blocks) {
      const seen = new Set([tileKey(start.x, start.y)]), queue = [start];
      for (let head = 0; head < queue.length; head++) {
        for (const d of Object.values(DIRS)) {
          const x = queue[head].x + d.dx, y = queue[head].y + d.dy;
          const key = tileKey(x, y);
          if (!inBounds(x, y) || seen.has(key) || blocks(tileAt(x,y))) continue;
          seen.add(key); queue.push({x,y});
        }
      }
      return seen;
    }
    for (let seed = 1; seed <= stats.maps; seed++) {
      let rng = seed;
      Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
      startGame();
      assert.equal(state.board.filter(t => t.type === "mine").length, state.config.bombCount);
      assert.equal(state.board.filter(t => t.type === "wall").length, state.config.wallCount);
      assert.equal(state.board.filter(t => t.type === "ridge").length, state.config.ridgeLines * RIDGE_LENGTH);
      for (const p of state.players) assert.equal(tileAt(p.x,p.y).type, "safe");
      const connected = reachable(state.players[0], t => t.type === "ridge");
      if (state.players.some(p => !connected.has(tileKey(p.x,p.y)))) {
        stats.disconnected++;
        if (stats.examples.length < 3) stats.examples.push({seed, ridges: state.board.filter(t => t.type === "ridge").map(({x,y}) => ({x,y}))});
      }
      for (const p of state.players) {
        if (reachable(p, isBlockingTerrain).size === 1) stats.blockedStarts++;
      }
    }
    JSON.stringify(stats);
  }`);
  console.log(result);
}
