const test = require("node:test");
const assert = require("node:assert/strict");
const {game} = require("./helpers");

test("Terrain/edge collision deals 1 HP and can eliminate; another player blocks without damage", () => {
  const {run} = game();
  run(`
    const [p, victim, other] = state.players;
    for (const obstacle of ["wall", "ridge", "edge", "player"]) {
      p.x=7;p.y=4;victim.x=8;victim.y=4;victim.hp=3;victim.alive=true;
      other.x=0;other.y=0;tileAt(9,4).type="safe";
      if(obstacle==="edge"){p.x=8;victim.x=9;}
      else if(obstacle==="player"){other.x=9;other.y=4;}
      else tileAt(9,4).type=obstacle;
      const before=victim.x;
      executeAction(p,{action:"ATTACK",dir:"RIGHT"});
      assert.equal(victim.hp,obstacle==="player"?3:2);assert.equal(victim.x,before);
      if(obstacle!=="player"){
        victim.hp=1;executeAction(p,{action:"ATTACK",dir:"RIGHT"});
        assert.equal(victim.hp,0);assert.equal(victim.alive,false);
      }
    }
  `);
});

test("Directional Dodge waits, sidesteps once, and subsequent actions use the actual position", () => {
  const {run}=game();
  run(`
    const [p,victim]=state.players;p.x=4;p.y=4;victim.x=5;victim.y=4;
    executeAction(victim,{action:"DODGE",dir:"DOWN"});assert.equal(victim.y,4);
    executeAction(p,{action:"ATTACK",dir:"RIGHT"});
    assert.equal(victim.x,5);assert.equal(victim.y,5);assert.equal(victim.hp,3);assert.equal(victim.dodge,false);
    executeAction(p,{action:"ATTACK",dir:"DOWN_RIGHT"});assert.equal(victim.x,6);assert.equal(victim.y,6);
    executeAction(victim,{action:"MOVE",dir:"UP"});assert.equal(victim.y,5);
  `);
});

test("Blocked Dodge is consumed, attack continues, replacement overwrites and round end clears Dodge", () => {
  const {run}=game();
  run(`
    const [p,victim,other]=state.players;p.x=4;p.y=4;victim.x=5;victim.y=4;
    executeAction(victim,{action:"DODGE",dir:"DOWN"});other.x=5;other.y=5;
    executeAction(p,{action:"ATTACK",dir:"RIGHT"});
    assert.equal(victim.x,6);assert.equal(victim.dodge,false);assert.match(state.log,/dodge fails/);
    executeAction(victim,{action:"DODGE",dir:"DOWN"});executeAction(victim,{action:"DODGE",dir:"UP"});
    assert.equal(victim.dodge,"UP");finishRound();assert.equal(victim.dodge,false);
  `);
});

test("Round 20 versus 21: moving, being pushed, and dodging onto bombs respect Sudden Death", () => {
  const {run}=game({startingHp:"5"});
  run(`
    const [p,victim]=state.players;
    for(const round of [20,21]) for(const action of ["MOVE","ATTACK","DODGE"]){
      state.round=round;p.x=4;p.y=4;victim.x=5;victim.y=4;victim.hp=5;victim.alive=true;victim.dodge=false;
      tileAt(5,5).type="safe";tileAt(6,4).type="safe";
      if(action==="DODGE"){
        tileAt(5,5).type="mine";executeAction(victim,{action:"DODGE",dir:"DOWN"});
        executeAction(p,{action:"ATTACK",dir:"RIGHT"});
      } else {
        tileAt(6,4).type="mine";executeAction(action==="MOVE"?victim:p,{action,dir:"RIGHT"});
      }
      assert.equal(victim.hp,round===20?4:0);assert.equal(victim.alive,round===20);
      const tile=tileAt(victim.x,victim.y);assert.equal(tile.type,"safe");assert.equal(tile.exploded,true);
      assert.equal(tile.explosionRound,round);
    }
  `);
});

test("Round 21 announces Sudden Death but collision damage remains one HP", () => {
  const {run,elements}=game({startingHp:"5"});
  run(`
    state.round=20;finishRound();assert.equal(state.round,21);assert.equal(GameRules.suddenDeath(),true);
    const [p,victim]=state.players;p.x=8;p.y=4;victim.x=9;victim.y=4;
    executeAction(p,{action:"ATTACK",dir:"RIGHT"});assert.equal(victim.hp,4);
  `);
  assert.match(elements.get("message").textContent,/Sudden Death/);
  assert.ok(elements.get("pressureHint").classList.contains("sudden-death"));
});

test("Final bomb clearance selects highest HP, shares ties, and stops pending actions immediately", () => {
  for(const tied of [false,true]){
    const {run,elements}=game({emptyBoard:true});
    run(`
      tileAt(1,0).type="mine";state.players[0].hp=2;state.players[1].hp=3;state.players[2].hp=${tied?3:1};
      state.players[0].program=[{action:"DISARM",dir:"RIGHT"}];
      state.players[1].program=[{action:"BOMB",dir:"LEFT"}];
      beginExecution();resolveAll();
      assert.equal(state.phase,"winner");assert.equal(state.executionIndex,1);
      assert.equal(bombCounts().remaining,0);assert.equal(state.queue[1].done,false);
    `);
    assert.match(elements.get("winnerTitle").textContent,tied?/Player 2 & Player 3 Share Victory/:/Player 2 Wins/);
  }
});

test("Last survivor takes precedence over clearance; eliminated players are excluded", () => {
  const {run,elements}=game({emptyBoard:true});
  run(`state.players.slice(0,2).forEach(p=>{p.alive=false;p.hp=0;});assert.equal(checkWinner(),true);`);
  assert.match(elements.get("winnerText").textContent,/Last survivor/);
  assert.match(elements.get("winnerTitle").textContent,/Player 3/);
});

test("A player-blocked movement is spent and skipped; the later step still executes", () => {
  const {run}=game();
  run(`
    const [p,blocker]=state.players;p.x=4;p.y=4;blocker.x=5;blocker.y=4;
    p.program=[{action:"MOVE",dir:"RIGHT"},{action:"MOVE",dir:"DOWN"}];
    beginExecution();resolveNext();assert.equal(p.x,4);assert.equal(p.y,4);assert.equal(state.executionIndex,1);
    assert.match(state.queue[0].resultLog,/blocked by Player 2 and skipped/);
    resolveNext();assert.equal(p.x,4);assert.equal(p.y,5);
  `);
});

test("Clues exclude their center, stay snapshots after bomb changes, and update only on rescan", () => {
  const {run}=game();
  run(`
    const p=state.players[0];p.x=4;p.y=4;tileAt(5,4).type="mine";
    GameRules.scan(p,[tileAt(5,4)]);assert.equal(tileAt(5,4).clueCount,0);assert.equal(tileAt(5,4).revealed,false);
    executeAction(p,{action:"SCAN"});assert.equal(tileAt(4,4).clueCount,1);
    executeAction(p,{action:"DISARM",dir:"RIGHT"});assert.equal(tileAt(4,4).clueCount,1);
    executeAction(p,{action:"BOMB",dir:"DOWN"});executeAction(p,{action:"BOMB",dir:"LEFT"});
    assert.equal(tileAt(4,4).clueCount,1);
    state.round=2;executeAction(p,{action:"SCAN"});assert.equal(tileAt(4,4).clueCount,2);assert.equal(tileAt(4,4).clueRound,2);
    assert.equal(tileAt(4,5).revealed,false);
  `);
});

test("Agents receive clue snapshots, Sudden Death, and directional defense choices", async () => {
  const {run}=game({humanCount:"1"});
  run(`
    state.round=21;GameRules.scan(state.players[0],[tileAt(1,0)]);
    MinefieldAgents.register("rules-observer",{label:"Observer",chooseAction(view){
      assert.equal(view.version,2);assert.equal(view.suddenDeath,true);
      assert.equal(view.board[1].type,"unknown");assert.equal(view.board[1].clueCount,0);assert.equal(view.board[1].clueRound,21);
      assert.ok(view.legalActions.filter(a=>["DODGE","DISARM"].includes(a.action)).every(a=>view.directions[a.dir]));
      return {action:"DISCARD"};
    }});
    state.players.slice(1).forEach(p=>p.controller="rules-observer");
    completeDicePhase();chooseAction("DISCARD");confirmProgram();
  `);
  await new Promise(resolve=>setImmediate(resolve));
  run('assert.equal(state.phase,"execution");assert.equal(state.agentFailures.size,0);');
});
