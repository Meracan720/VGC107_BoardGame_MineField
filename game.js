/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

// Rules and defaults. Keep action costs here so planning, refunds, and execution agree.
const SIZE = 10;
const DEFAULT_START_HP = 5;
const MAX_START_HP = 10;
const DEFAULT_BOMB_PERCENT = 20;
const DEFAULT_WALL_COUNT = 16;
const DEFAULT_RIDGE_LINES = 1;
const RIDGE_LENGTH = 5;
const MAX_ACTION_POINTS = 6;

const DIRS = {
  UP_LEFT:   {dx: -1, dy: -1, symbol: "↖", diagonal: true},
  UP:        {dx: 0,  dy: -1, symbol: "↑", diagonal: false},
  UP_RIGHT:  {dx: 1,  dy: -1, symbol: "↗", diagonal: true},
  LEFT:      {dx: -1, dy: 0,  symbol: "←", diagonal: false},
  RIGHT:     {dx: 1,  dy: 0,  symbol: "→", diagonal: false},
  DOWN_LEFT: {dx: -1, dy: 1,  symbol: "↙", diagonal: true},
  DOWN:      {dx: 0,  dy: 1,  symbol: "↓", diagonal: false},
  DOWN_RIGHT:{dx: 1,  dy: 1,  symbol: "↘", diagonal: true},
};

// BFS keeps paths shortest; visiting straight steps first breaks ties in their favor.
const MOVEMENT_DIRECTIONS = Object.entries(DIRS).sort(
  ([, a], [, b]) => Number(a.diagonal) - Number(b.diagonal)
);

const ACTIONS = {
  MOVE:   {cost: 1, needsDir: true,  allowsDiagonal: true,  label: "Move"},
  ATTACK: {cost: 1, needsDir: true,  allowsDiagonal: true, label: "Attack"},
  DODGE:  {cost: 1, needsDir: true, allowsDiagonal: true, label: "Dodge"},
  DISARM: {cost: 1, needsDir: true, allowsDiagonal: true, label: "Disarm"},
  BOMB:   {cost: 1, needsDir: true, allowsDiagonal: false, label: "Plant Bomb"},
  BREAK_WALL: {cost: 2, needsDir: true, allowsDiagonal: false, label: "Break Wall"},
  SCAN:      {cost: 1, needsDir: false, allowsDiagonal: false, label: "Scan Here"},
  TRI_SCAN:  {cost: 2, needsDir: true,  allowsDiagonal: true,  label: "3-Grid Scan"},
  AREA_SCAN: {cost: 3, needsDir: true,  allowsDiagonal: true,  label: "3×3 Scan"},
  DISCARD:   {cost: 1, needsDir: false, allowsDiagonal: false, label: "Discard Remaining"},
};

// The same scan geometry is used for target validation, previews, and execution.
// A null size means the surrounding scan may be clipped at the board edge.
const SCAN_RULES = {
  SCAN: {region: origin => [tileAt(origin.x, origin.y)], size: null, label: () => "current"},
  TRI_SCAN: {region: threeGridScanRegion, size: 3, name: "3-grid", label: dir => `${DIRS[dir].symbol} directional`},
  AREA_SCAN: {region: directionalScanRegion, size: 9, name: "3×3", label: dir => `${DIRS[dir].symbol} 3×3`},
};

const ACTION_HINTS = {
  ATTACK: "Reach 2 grids straight or 1 diagonally; push 1 grid. A wall, ridge, or edge blocking the push deals 1 HP. Players block without damage.",
  MOVE: "Choose a path. A step blocked by another player is skipped and spent; later programmed steps still execute from your actual position.",
  DODGE: "Choose an adjacent escape grid. The next attack triggers a sidestep there. Blocked escape fails; bombs still trigger. One dodge, this round only.",
  DISARM: "Choose one adjacent grid in any direction. Remove its bomb safely, or verify it is safe. Costs 1 point; no flags needed.",
  BOMB: "Plant a bomb on an adjacent non-terrain grid (↑ ↓ ← →) for 1 point. Preserves visibility; cannot break walls.",
  BREAK_WALL: "Destroy an adjacent wall (↑ ↓ ← →) for 2 points. Opens paths for later movement; ridges cannot be broken.",
  SCAN: "Record a number on your current grid: bombs in its eight neighbors, excluding the center. The clue is a snapshot, not a live counter. Costs 1 point.",
  TRI_SCAN: "Scan three grids for 2 points. Reveal bombs directly, without numbers. Other grids keep their visibility. Found initial bombs stay visible until removed.",
  AREA_SCAN: "Aim a 3×3 patch of numbered clues for 3 points. Each counts its eight neighbors. Clues are snapshots; walls do not block counting.",
};

const ALLOCATION_LABELS = {
  move: "Movement", scan: "Scan", attack: "Attack",
  dodge: "Dodge / Disarm", bomb: "Bomb", discard: "Discard",
};

// State owns the public board and each player's private program. Selection is only
// an unconfirmed preview: it must never mutate the board or spend action points.
let state = null;
let selection = {action: null, dir: null, path: [], target: null};
let deniedTile = null;

const el = id => document.getElementById(id);
const actionButtons = document.querySelectorAll("[data-action]");
const boardCells = [];

// UI entry points. This script loads after the HTML, so static controls exist here.
el("startGameBtn").addEventListener("click", startGame);
el("newGameBtn").addEventListener("click", resetToSetup);
el("playAgainBtn").addEventListener("click", resetToSetup);
el("confirmProgramBtn").addEventListener("click", confirmProgram);
el("readyNextPlayerBtn").addEventListener("click", readyNextPlayer);
el("resolveNextBtn").addEventListener("click", resolveNext);
el("resolveAllBtn").addEventListener("click", resolveAll);
el("rollDiceBtn").addEventListener("click", rollDice);
el("beginPlanningBtn").addEventListener("click", DicePhase.startPlanning);
el("undoActionBtn").addEventListener("click", undoLastAction);

["playerCount", "startingHp", "terrainCount", "ridgeCount", "bombPercent"].forEach(id => {
  el(id).addEventListener("input", updateSetupConfig);
});
el("terrainType").addEventListener("change", updateSetupConfig);
el("playerCount").addEventListener("change", updateSetupConfig);
el("humanCount").addEventListener("change", updateSetupConfig);
el("botDifficulty").addEventListener("change", updateSetupConfig);
el("turnOrderMode").addEventListener("change", updateSetupConfig);
el("visibilityMode").addEventListener("change", updateSetupConfig);

actionButtons.forEach(btn => {
  btn.addEventListener("click", () => chooseAction(btn.dataset.action));
});

updateSetupConfig();

// Setup and map generation: normalize controls once, then use the same config
// for the setup summary and the generated game. Explicit zero terrain is valid.
function readIntegerInput(id, fallback, minimum, maximum) {
  const input = el(id);
  const requested = input.value === "" ? fallback : Number(input.value);
  const value = Number.isFinite(requested)
    ? Math.min(maximum, Math.max(minimum, Math.floor(requested)))
    : fallback;
  input.value = value;
  return value;
}

function updateSetupConfig() {
  const startingHp = readIntegerInput("startingHp", DEFAULT_START_HP, 1, MAX_START_HP);
  el("startingHpValue").textContent = `${startingHp} HP`;
  const totalTiles = SIZE * SIZE;
  const playerCount = readIntegerInput("playerCount", 4, 3, 6);
  const terrainInput = el("terrainType");
  const terrainType = ["wall", "ridge", "random"].includes(terrainInput.value) ? terrainInput.value : "wall";
  terrainInput.value = terrainType;
  const wallInput = el("terrainCount");
  const ridgeInput = el("ridgeCount");
  const selectedWalls = readIntegerInput("terrainCount", DEFAULT_WALL_COUNT, 0, 20);
  const selectedRidges = readIntegerInput("ridgeCount", DEFAULT_RIDGE_LINES, 0, 2);
  const wallCount = terrainType === "ridge" ? 0 : selectedWalls;
  const ridgeLines = terrainType === "wall" ? 0 : Math.min(2, selectedRidges);
  wallInput.disabled = terrainType === "ridge";
  ridgeInput.disabled = terrainType === "wall";

  const reservedTerrain = wallCount + ridgeLines * RIDGE_LENGTH;
  const maximumBombs = Math.max(3, totalTiles - playerCount - reservedTerrain);
  const maximumPercent = Math.max(3, Math.floor(maximumBombs / totalTiles * 100));
  const bombInput = el("bombPercent");
  bombInput.max = maximumPercent;
  const bombPercent = readIntegerInput("bombPercent", DEFAULT_BOMB_PERCENT, 3, maximumPercent);
  const bombCount = Math.min(maximumBombs, Math.round(totalTiles * bombPercent / 100));

  el("terrainCountValue").textContent = selectedWalls;
  el("ridgeCountValue").textContent = selectedRidges;
  el("bombPercentValue").textContent = `${bombPercent}%`;
  el("mapSummary").textContent =
    `${bombCount} hidden bomb${bombCount === 1 ? "" : "s"} · ` +
    `${wallCount} wall${wallCount === 1 ? "" : "s"} · ` +
    `${ridgeLines} long ridge${ridgeLines === 1 ? "" : "s"}`;

  const agents = GameAgents.setup(playerCount);
  return {playerCount, startingHp, terrainType, wallCount, ridgeLines, bombPercent, bombCount,
    ...agents, ...TurnOrder.setup(playerCount, agents.humanCount), ...GridVisibility.setup(), ...GameMutators.setup()};
}

function resetToSetup() {
  DicePhase.cancel();
  GameAgents.cancel();
  state = null;
  deniedTile = null;
  el("setupPanel").classList.remove("hidden");
  el("gamePanel").classList.add("hidden");
}

function startGame() {
  DicePhase.cancel();
  GameAgents.cancel();
  const config = updateSetupConfig();
  const {playerCount: count, startingHp, wallCount, ridgeLines, bombCount} = config;
  const starts = [
    {x: 0, y: 0},
    {x: SIZE - 1, y: SIZE - 1},
    {x: SIZE - 1, y: 0},
    {x: 0, y: SIZE - 1},
    {x: Math.floor((SIZE - 1) / 2), y: 0},
    {x: Math.ceil((SIZE - 1) / 2), y: SIZE - 1},
  ];
  state = {
    round: 1,
    phase: "rolling",
    rollingIndex: 0,
    planningIndex: 0,
    awaitingHandoff: false,
    executionIndex: 0,
    allocationCounter: 0,
    agentFailures: new Set(),
    config,
    turnOrder: TurnOrder.resolve(config),
    queue: [],
    players: Array.from({length: count}, (_, i) => ({
      id: i + 1,
      name: i < config.humanCount ? `Player ${i + 1}` : `Bot ${i + 1}`,
      controller: i < config.humanCount ? null : config.botDifficulty,
      x: starts[i].x,
      y: starts[i].y,
      hp: startingHp,
      alive: true,
      dodge: false,
      roll: null,
      pointsRemaining: 0,
      program: [],
    })),
    board: makeBoard(),
    log: "Round 1: Player 1 rolls for action points.",
  };

  // Starting tiles are known safe.
  state.players.forEach(p => {
    const t = tileAt(p.x, p.y);
    t.type = "safe";
    GridVisibility.reveal(t);
  });

  placeLongRidges(ridgeLines);
  placeWalls(wallCount);
  placeMines(bombCount);

  el("setupPanel").classList.add("hidden");
  el("gamePanel").classList.remove("hidden");
  DicePhase.begin();
}

function makeBoard() {
  // Row-major storage gives constant-time tile access: index = y * SIZE + x.
  return Array.from({length: SIZE * SIZE}, (_, i) => ({
    x: i % SIZE,
    y: Math.floor(i / SIZE),
    type: "safe",
    revealed: false,
    lastRevealedRound: null,
    initialMine: false,
    scannedInitialMine: false,
    clueCount: null,
    clueRound: null,
    exploded: false,
  }));
}

function availablePlacementTiles() {
  return state.board.filter(tile =>
    !tile.revealed &&
    tile.type === "safe" &&
    !state.players.some(p => p.x === tile.x && p.y === tile.y)
  );
}

function shuffledTiles(tiles) {
  // Fisher–Yates samples without replacement and does not mutate the input list.
  const shuffled = [...tiles];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function placeWalls(amount) {
  shuffledTiles(availablePlacementTiles()).slice(0, amount).forEach(tile => {
    tile.type = "wall";
    tile.revealed = true;
  });
}

function possibleRidgeLines() {
  const lines = [];
  const available = new Set(availablePlacementTiles());
  const directions = [{dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: 1, dy: 1}, {dx: 1, dy: -1}];

  directions.forEach(dir => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const endX = x + dir.dx * (RIDGE_LENGTH - 1);
        const endY = y + dir.dy * (RIDGE_LENGTH - 1);
        if (!inBounds(endX, endY)) continue;

        const tiles = Array.from({length: RIDGE_LENGTH}, (_, i) =>
          tileAt(x + dir.dx * i, y + dir.dy * i)
        );
        const legal = tiles.every(tile => available.has(tile));
        if (legal) lines.push(tiles);
      }
    }
  });
  return lines;
}

function placeLongRidges(amount) {
  const lineCount = Math.min(2, Math.max(0, amount));
  for (let i = 0; i < lineCount; i++) {
    const candidates = possibleRidgeLines();
    if (!candidates.length) break;
    const ridge = candidates[Math.floor(Math.random() * candidates.length)];
    ridge.forEach(tile => {
      tile.type = "ridge";
      tile.revealed = true;
    });
  }
}

function placeMines(amount) {
  shuffledTiles(availablePlacementTiles()).slice(0, amount).forEach(tile => {
    tile.type = "mine";
    tile.initialMine = true;
  });
}

function tileAt(x, y) {
  return state.board[y * SIZE + x];
}

function inBounds(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function isBlockingTerrain(tile) {
  return tile.type === "wall" || tile.type === "ridge";
}

function livingPlayers() {
  return TurnOrder.players().filter(p => p.alive);
}

function currentPlanner() {
  const living = livingPlayers();
  return living[state.planningIndex] || null;
}

// Planning and board geometry. Programs contain relative moves, not guaranteed
// final positions: other players can block or push a player during execution.
function beginPlanningForCurrent() {
  selection = {action: null, dir: null, path: [], target: null};
  deniedTile = null;
  const p = currentPlanner();
  if (!p) return;
  p.program = [];
  p.pointsRemaining = p.roll;
  el("planningControls").classList.remove("hidden");
  el("passControls").classList.add("hidden");
  el("executionControls").classList.add("hidden");
  el("winnerControls").classList.add("hidden");
  GameAgents.begin(p);
  // Human turns render in the caller; the agent bridge manages async bot turns.
}

function chooseAction(action) {
  if (!GameAgents.humanTurn() || !ACTIONS[action]) return;
  const p = currentPlanner();
  if (!p || p.roll === null || ACTIONS[action].cost > p.pointsRemaining) return;
  selection = {action, dir: null, path: [], target: null};
  render();
}

function directionAllowed(action, dir) {
  if (!action || !dir || !ACTIONS[action].needsDir || !DIRS[dir]) return false;
  return ACTIONS[action].allowsDiagonal || !DIRS[dir].diagonal;
}

function surroundingTiles(origin) {
  const region = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (inBounds(x, y)) region.push(tileAt(x, y));
    }
  }
  return region;
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function planningPreview(p) {
  const position = {x: p.x, y: p.y};
  const brokenWalls = new Set();
  p.program.forEach(item => {
    const dir = DIRS[item.dir];
    if (!dir) return;
    if (item.action === "MOVE") {
      position.x += dir.dx;
      position.y += dir.dy;
    } else if (item.action === "BREAK_WALL") {
      const x = position.x + dir.dx, y = position.y + dir.dy;
      if (inBounds(x, y) && tileAt(x, y).type === "wall" && !tileAt(x, y).exploded) {
        brokenWalls.add(tileKey(x, y));
      }
    }
  });
  return {position, brokenWalls};
}

function plannedPosition(p) {
  return planningPreview(p).position;
}

function isPlanningBlocked(tile, preview) {
  return tile.type === "ridge" || (tile.type === "wall" && !preview.brokenWalls.has(tileKey(tile.x, tile.y)));
}

function movementPaths(p) {
  const preview = planningPreview(p);
  const start = preview.position;
  const paths = new Map([[tileKey(start.x, start.y), []]]);
  const queue = [{...start, path: []}];

  // A head index avoids shifting the remaining queue on every visited tile.
  // Each tile is visited once; all edges cost one point. Never inspect hidden
  // bombs or current player occupancy here (occupancy is checked at execution).
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current.path.length >= p.pointsRemaining) continue;

    MOVEMENT_DIRECTIONS.forEach(([name, dir]) => {
      const x = current.x + dir.dx;
      const y = current.y + dir.dy;
      const key = tileKey(x, y);
      if (!inBounds(x, y) || paths.has(key) || isPlanningBlocked(tileAt(x, y), preview)) return;
      const path = [...current.path, name];
      paths.set(key, path);
      queue.push({x, y, path});
    });
  }

  return paths;
}

function directionFromDelta(dx, dy) {
  return Object.keys(DIRS).find(name => DIRS[name].dx === dx && DIRS[name].dy === dy) || null;
}

function attackRegion(origin, dirName, preview = null) {
  const dir = DIRS[dirName];
  if (!dir) return [];
  const region = [];
  for (let step = 1; step <= (dir.diagonal ? 1 : 2); step++) {
    const x = origin.x + dir.dx * step, y = origin.y + dir.dy * step;
    if (!inBounds(x, y)) break;
    const tile = tileAt(x, y);
    if (preview ? isPlanningBlocked(tile, preview) : isBlockingTerrain(tile)) break;
    region.push(tile);
  }
  return region;
}

function directionalScanRegion(origin, dirName) {
  const dir = DIRS[dirName];
  if (!dir) return [];
  const center = {x: origin.x + dir.dx * 2, y: origin.y + dir.dy * 2};
  const region = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(x, y)) return [];
      region.push(tileAt(x, y));
    }
  }
  return region;
}

function threeGridScanRegion(origin, dirName) {
  const dir = DIRS[dirName];
  if (!dir) return [];

  const offsets = dir.diagonal
    ? [{dx: dir.dx, dy: 0}, {dx: 0, dy: dir.dy}, {dx: dir.dx, dy: dir.dy}]
    : [-1, 0, 1].map(spread => ({
        dx: dir.dx - dir.dy * spread,
        dy: dir.dy + dir.dx * spread,
      }));

  const region = [];
  for (const offset of offsets) {
    const x = origin.x + offset.dx;
    const y = origin.y + offset.dy;
    if (!inBounds(x, y)) return [];
    region.push(tileAt(x, y));
  }
  return region;
}

function selectBoardTile(tile) {
  if (!GameAgents.humanTurn()) return;
  const p = currentPlanner();
  if (p && p.pointsRemaining <= 0) return;
  if (!p || p.roll === null) {
    denyBoardTile(tile, "Roll the die before selecting a grid.");
    return;
  }

  if (!selection.action) selection = {action: "MOVE", dir: null, path: [], target: null};
  const action = selection.action;
  if (!ACTIONS[action].needsDir) {
    denyBoardTile(tile, `${ACTIONS[action].label} does not need a grid target.`);
    return;
  }

  const origin = plannedPosition(p);
  if (action === "MOVE") {
    const path = movementPaths(p).get(tileKey(tile.x, tile.y));
    if (!path || path.length === 0) {
      denyBoardTile(tile, "That grid exceeds the available movement area or is blocked.");
      return;
    }
    selection.dir = path[0];
    selection.path = path;
    selection.target = {x: tile.x, y: tile.y};
    state.log = `${p.name} selected a ${path.length}-point movement path.`;
    render();
    return;
  }

  const dx = tile.x - origin.x;
  const dy = tile.y - origin.y;
  const dir = action === "ATTACK"
    ? directionFromDelta(Math.sign(dx), Math.sign(dy)) : directionFromDelta(dx, dy);
  const blockedTarget =
    (["DODGE", "DISARM"].includes(action) && isPlanningBlocked(tile, planningPreview(p))) ||
    (action === "ATTACK" && !attackRegion(origin, dir, planningPreview(p)).includes(tile)) ||
    (action === "BREAK_WALL" && tile.type !== "wall") ||
    (action === "BOMB" && isBlockingTerrain(tile)) ||
    (action === "BOMB" && tile.exploded);
  const scan = SCAN_RULES[action];
  const invalidScan = scan && scan.size !== null && scan.region(origin, dir).length !== scan.size;
  if (!dir || !directionAllowed(action, dir) || blockedTarget || invalidScan) {
    denyBoardTile(tile, `That grid is not a legal ${ACTIONS[action].label.toLowerCase()} target.`);
    return;
  }

  selection.dir = dir;
  selection.path = [];
  selection.target = {x: tile.x, y: tile.y};
  state.log = `${p.name} selected a grid for ${ACTIONS[action].label.toLowerCase()}.`;
  render();
}

function denyBoardTile(tile, message) {
  selection.dir = null;
  selection.path = [];
  selection.target = null;
  // Object identity keeps an old animation timer from clearing a newer denial.
  const denial = {key: tileKey(tile.x, tile.y)};
  deniedTile = denial;
  state.log = message;
  render();
  setTimeout(() => {
    if (deniedTile !== denial) return;
    deniedTile = null;
    if (state) renderBoard();
  }, 450);
}

function rollDice() {
  DicePhase.roll();
}

function canAddSelection() {
  if (!GameAgents.humanTurn()) return false;
  const p = currentPlanner();
  if (!p || p.roll === null) return false;
  if (!selection.action) return false;
  if (selection.action === "MOVE") {
    return selection.path.length > 0 && selection.path.length <= p.pointsRemaining;
  }
  if (ACTIONS[selection.action].needsDir && !selection.dir) return false;
  return ACTIONS[selection.action].cost <= p.pointsRemaining;
}

function selectionCost() {
  if (!selection.action) return 0;
  if (selection.action === "DISCARD") {
    const p = currentPlanner();
    return p ? p.pointsRemaining : 0;
  }
  return selection.action === "MOVE" ? selection.path.length : ACTIONS[selection.action].cost;
}

function updatePlanningUI() {
  if (!state || state.phase !== "planning") return;
  const p = currentPlanner();
  if (!p || GameAgents.isBot(p)) return;

  actionButtons.forEach(btn => {
    btn.disabled = p.roll === null || ACTIONS[btn.dataset.action].cost > p.pointsRemaining;
    btn.classList.toggle("selected", btn.dataset.action === selection.action);
  });
  el("diceFace").textContent = p.roll === null ? "—" : diceSymbol(p.roll);
  el("diceHint").textContent = p.roll === null
    ? "Roll before selecting any actions."
    : `${p.pointsRemaining} of ${p.roll} action point${p.roll === 1 ? "" : "s"} remaining.`;
  el("planningHint").textContent = p.roll === null
    ? `${p.name}: roll for action points.`
    : `${p.name}: secretly build your program.`;
  el("actionHint").textContent = ACTION_HINTS[selection.action]
    || "For directional actions, select an action and click its target on the board.";
  el("pointsRemaining").textContent = p.roll === null ? "—" : `${p.pointsRemaining} / ${p.roll}`;

  const movementPreview = el("movementCostPreview");
  if (p.roll !== null && selection.action === "MOVE") {
    movementPreview.classList.remove("hidden");
    movementPreview.textContent = selection.path.length
      ? `Move: ${selection.path.length} point${selection.path.length === 1 ? "" : "s"} · ` +
        `${p.pointsRemaining - selection.path.length} left after adding`
      : `Choose a destination · up to ${p.pointsRemaining} points`;
  } else {
    movementPreview.classList.add("hidden");
    movementPreview.textContent = "";
  }

  renderAllocationTrack(p);
  renderProgramList(p);
  el("undoActionBtn").disabled = p.program.length === 0;
  el("confirmProgramBtn").disabled = !canAddSelection();
  const cost = selectionCost();
  if (selection.action && cost > 0) {
    el("confirmProgramBtn").textContent = `Add ${ACTIONS[selection.action].label} · ${cost} point${cost === 1 ? "" : "s"}`;
  } else if (selection.action && ACTIONS[selection.action].needsDir) {
    el("confirmProgramBtn").textContent = "Select a Board Grid";
  } else {
    el("confirmProgramBtn").textContent = "Choose an Action";
  }
}

function renderAllocationTrack(p) {
  // A two-point action occupies two cubes but is still one execution queue item.
  const track = el("allocationTrack");
  track.innerHTML = "";
  const allocatedTypes = [];
  p.program.forEach(item => {
    const type = allocationType(item.action);
    for (let i = 0; i < ACTIONS[item.action].cost; i++) allocatedTypes.push(type);
  });
  const previewStart = allocatedTypes.length;
  const previewEnd = selection.action === "MOVE"
    ? previewStart + selection.path.length
    : previewStart;

  for (let i = 0; i < MAX_ACTION_POINTS; i++) {
    const cell = document.createElement("span");
    const allocatedType = allocatedTypes[i];
    const isUsable = p.roll !== null && i < p.roll;
    const isMovePreview = isUsable && i >= previewStart && i < previewEnd;

    if (allocatedType) {
      cell.className = `allocation-cell point-${allocatedType}`;
      cell.textContent = "*";
      cell.title = `${allocationLabel(allocatedType)} allocation · point ${i + 1}`;
    } else if (isMovePreview) {
      cell.className = "allocation-cell preview-move";
      cell.textContent = "+";
      cell.title = `Pending movement point ${i + 1}`;
    } else if (isUsable) {
      cell.className = "allocation-cell usable";
      cell.textContent = "_";
      cell.title = `Usable point ${i + 1}`;
    } else {
      cell.className = "allocation-cell locked";
      cell.textContent = "";
      cell.title = p.roll === null ? "Roll to unlock this cube" : "Not included in this roll";
    }
    track.appendChild(cell);
  }
}

function allocationType(action) {
  if (action === "MOVE") return "move";
  if (SCAN_RULES[action]) return "scan";
  if (action === "ATTACK") return "attack";
  if (action === "DODGE" || action === "DISARM") return "dodge";
  if (action === "BOMB" || action === "BREAK_WALL") return "bomb";
  return "discard";
}

function allocationLabel(type) {
  return ALLOCATION_LABELS[type] || "Action";
}

function renderProgramList(p) {
  const list = el("programList");
  list.innerHTML = "";
  if (p.program.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = p.roll === null ? "Roll the die to begin." : "No actions allocated yet.";
    list.appendChild(empty);
    return;
  }

  const allocations = [];
  p.program.forEach(item => {
    const last = allocations[allocations.length - 1];
    if (last && last.id === item.allocationId) last.items.push(item);
    else allocations.push({id: item.allocationId, items: [item]});
  });

  allocations.forEach(allocation => {
    const row = document.createElement("li");
    const first = allocation.items[0];
    const cost = allocation.items.reduce((sum, item) => sum + ACTIONS[item.action].cost, 0);
    let label = formatAction(first);
    if (first.action === "MOVE") {
      label = `Move ${allocation.items.map(item => DIRS[item.dir].symbol).join(" ")}`;
    } else if (first.action === "DISCARD") {
      label = "Discard";
    }
    row.textContent = `${label} · ${cost} point${cost === 1 ? "" : "s"}`;
    list.appendChild(row);
  });
}

function confirmProgram() {
  const p = currentPlanner();
  if (!p || !canAddSelection()) return;

  const cost = selectionCost();
  // Movement and discarded points expand into one-point queue steps. Sharing
  // an allocation ID lets Undo remove the entire choice, not just its last step.
  const allocationId = ++state.allocationCounter;
  if (selection.action === "MOVE") {
    selection.path.forEach(dir => p.program.push({action: "MOVE", dir, allocationId}));
  } else if (selection.action === "DISCARD") {
    for (let i = 0; i < cost; i++) {
      p.program.push({action: "DISCARD", dir: null, allocationId});
    }
  } else {
    p.program.push({action: selection.action, dir: selection.dir, allocationId});
  }
  p.pointsRemaining -= cost;
  selection = {action: null, dir: null, path: [], target: null};

  if (p.pointsRemaining > 0) {
    state.log = `${p.name} has ${p.pointsRemaining} action point${p.pointsRemaining === 1 ? "" : "s"} left to allocate.`;
    render();
    return;
  }

  state.log = `${p.name} has secretly allocated all action points.`;
  if (GameAgents.humanFinished()) return;
  el("planningControls").classList.add("hidden");
  el("passControls").classList.remove("hidden");

  const living = livingPlayers();
  if (state.planningIndex < living.length - 1) {
    el("passMessage").textContent = "Pass the computer to the next player. Their screen will appear after Ready.";
    el("readyNextPlayerBtn").textContent = "Ready for Next Player";
  } else {
    el("passMessage").textContent = "All players have programmed their actions.";
    el("readyNextPlayerBtn").textContent = "Begin Execution";
  }
  render();
}

function undoLastAction() {
  if (!GameAgents.humanTurn()) return;
  const p = currentPlanner();
  if (!p || p.program.length === 0) return;
  const allocationId = p.program[p.program.length - 1].allocationId;
  let refunded = 0;
  while (p.program.length && p.program[p.program.length - 1].allocationId === allocationId) {
    const removed = p.program.pop();
    refunded += ACTIONS[removed.action].cost;
  }
  p.pointsRemaining += refunded;
  selection = {action: null, dir: null, path: [], target: null};
  state.log = `${p.name} removed the last programmed action.`;
  render();
}

function readyNextPlayer() {
  if (GameAgents.ready()) return;
  if (!GameAgents.humanTurn() || !currentPlanner() || currentPlanner().roll === null || currentPlanner().pointsRemaining > 0) return;
  const living = livingPlayers();
  if (state.planningIndex < living.length - 1) {
    state.planningIndex++;
    state.log = `${currentPlanner().name}: privately program your ${currentPlanner().roll} points.`;
    beginPlanningForCurrent();
    render();
  } else {
    beginExecution();
  }
}

// Execution is step-major: every living player's first item, then every second
// item, and so on. Queue entries stay hidden until that exact item resolves.
function beginExecution() {
  el("botControls").classList.add("hidden");
  state.phase = "execution";
  state.executionIndex = 0;
  state.players.forEach(p => p.dodge = false);

  const livingAtStart = livingPlayers();
  state.queue = [];
  const longestProgram = Math.max(0, ...livingAtStart.map(p => p.program.length));
  for (let step = 0; step < longestProgram; step++) {
    livingAtStart.forEach(p => {
      const programmed = p.program[step];
      if (programmed) {
        state.queue.push({
          playerId: p.id,
          step,
          ...programmed,
          done: false,
        });
      }
    });
  }

  el("planningControls").classList.add("hidden");
  el("passControls").classList.add("hidden");
  el("executionControls").classList.remove("hidden");
  state.log = "Execution phase started.";
  if (state.agentFailures.size) {
    state.log += " A bot could not finish planning; its unused points were discarded.";
  }
  if (!livingPlayers().some(p => !GameAgents.isBot(p))) {
    state.log += " All humans are eliminated. Resolve actions to watch the remaining bots, or start a New Game.";
  }
  render();
}

function resolveNext() {
  if (!state || state.phase !== "execution") return;
  if (state.executionIndex >= state.queue.length) {
    finishRound();
    return;
  }

  resolveQueuedAction();
  if (!checkWinner()) render();
}

function resolveAll() {
  if (!state || state.phase !== "execution") return;
  // Each iteration advances the index in a fixed queue, so no arbitrary safety
  // limit is needed. Check for a winner after each action, not just at the end.
  while (state.executionIndex < state.queue.length) {
    resolveQueuedAction();
    if (checkWinner()) return;
  }
  // Batch execution paints once, when the next round (or winner) is ready.
  finishRound();
}

function resolveQueuedAction() {
  const item = state.queue[state.executionIndex];
  const p = state.players.find(player => player.id === item.playerId);
  const beforeVitals = capturePlayerVitals();
  if (p && p.alive) {
    executeAction(p, item);
  } else {
    state.log = `${p ? p.name : "A player"} is eliminated, so the action is skipped.`;
  }
  recordActionOutcome(item, beforeVitals);
  item.done = true;
  state.executionIndex++;
}

function capturePlayerVitals() {
  // Compare all players, since an attack can injure someone other than its actor.
  return new Map(state.players.map(p => [p.id, {hp: p.hp, alive: p.alive}]));
}

function recordActionOutcome(item, beforeVitals) {
  const eliminated = [];
  const damaged = [];

  state.players.forEach(p => {
    const before = beforeVitals.get(p.id);
    if (!before) return;
    const hpLost = Math.max(0, before.hp - p.hp);
    if (before.alive && !p.alive) {
      eliminated.push({name: p.name, hpLost});
    } else if (hpLost > 0) {
      damaged.push({name: p.name, hpLost});
    }
  });

  item.resultLog = state.log;
  if (eliminated.length) {
    item.eventType = "eliminated";
    item.eventText = eliminated.map(event =>
      `☠ ${event.name}${event.hpLost ? ` lost ${event.hpLost} HP and` : ""} was eliminated`
    ).join(" · ");
  } else if (damaged.length) {
    item.eventType = "hp-loss";
    item.eventText = damaged.map(event =>
      `⚠ ${event.name} lost ${event.hpLost} HP`
    ).join(" · ");
  } else {
    item.eventType = null;
    item.eventText = "";
  }
}

// Action effects use the real position and board at execution time. A preview
// is not a promise: earlier actions may change targets, occupancy, or health.
function executeAction(p, item) {
  const action = item.action;
  const dir = item.dir ? DIRS[item.dir] : null;

  if (action === "DISCARD") {
    state.log = `${p.name} discards an unused action point.`;
    return;
  }

  if (action === "DODGE") {
    p.dodge = item.dir;
    state.log = `${p.name} prepares a ${dir.symbol} sidestep for the next attack this round. It replaces any earlier dodge.`;
    return;
  }

  if (action === "DISARM") {
    GameRules.disarm(p, item.dir);
    return;
  }

  const scan = SCAN_RULES[action];
  if (scan) {
    const region = scan.region(p, item.dir);
    if (scan.size !== null && region.length !== scan.size) {
      state.log = `${p.name}'s ${scan.name} scan extends beyond the board, so nothing is revealed.`;
      return;
    }
    if (action === "TRI_SCAN") GameRules.revealBombs(p, region);
    else revealScanRegion(p, region, scan.label(item.dir));
    return;
  }

  if (action === "BOMB" || action === "BREAK_WALL") {
    const tx = p.x + dir.dx;
    const ty = p.y + dir.dy;
    if (!inBounds(tx, ty)) {
      state.log = `${p.name}'s ${ACTIONS[action].label.toLowerCase()} target is outside the board.`;
      return;
    }
    const t = tileAt(tx, ty);
    const occupied = state.players.some(x => x.alive && x.x === tx && x.y === ty);
    if (occupied || t.exploded || (action === "BOMB" ? isBlockingTerrain(t) : t.type !== "wall")) {
      state.log = `${p.name} cannot ${action === "BOMB" ? "plant a bomb" : "break a wall"} there.`;
      return;
    }
    if (action === "BREAK_WALL") {
      t.type = "safe";
      GridVisibility.reveal(t);
      t.exploded = true;
      state.log = `${p.name} detonates and destroys a wall ${DIRS[item.dir].symbol}.`;
      return;
    }
    t.type = "mine";
    // An existing initial mine keeps its identity and any scan highlight.
    // Planting changes contents only: preserve knowledge and its original timer.
    state.log = `${p.name} places a bomb ${DIRS[item.dir].symbol}.`;
    return;
  }

  if (action === "ATTACK") {
    GameRules.attack(p, item.dir);
    return;
  }

  if (action === "MOVE") {
    moveSteps(p, dir, 1, `${p.name} moves ${DIRS[item.dir].symbol}.`);
  }
}

function revealScanRegion(p, region, label) {
  GameRules.scan(p, region);
}

function canEnter(x, y, movingPlayerId) {
  if (!inBounds(x, y)) return false;
  const t = tileAt(x, y);
  if (isBlockingTerrain(t)) return false;
  return !state.players.some(p => p.alive && p.id !== movingPlayerId && p.x === x && p.y === y);
}

function moveSteps(p, dir, steps, successText) {
  let moved = 0;
  let blockage = "terrain or the board edge";
  const tileEvents = [];
  for (let i = 0; i < steps; i++) {
    const nx = p.x + dir.dx;
    const ny = p.y + dir.dy;
    if (!canEnter(nx, ny, p.id)) {
      const blocker = state.players.find(other => other.alive && other.id !== p.id && other.x === nx && other.y === ny);
      if (blocker) blockage = blocker.name;
      break;
    }
    p.x = nx;
    p.y = ny;
    moved++;
    const tileEvent = triggerTile(p);
    if (tileEvent) tileEvents.push(tileEvent);
    if (!p.alive) break;
  }

  let movementLog;
  if (moved === 0) movementLog = `${p.name}'s movement is blocked by ${blockage} and skipped. The point is spent; later programmed actions continue.`;
  else if (moved < steps) movementLog = `${successText} Movement stops after ${moved} grid${moved === 1 ? "" : "s"}.`;
  else movementLog = successText;
  state.log = [movementLog, ...tileEvents].join(" ");
}

function triggerTile(p) {
  if (!p.alive) return;
  const t = tileAt(p.x, p.y);

  if (t.type === "mine") {
    GridVisibility.reveal(t);
    t.exploded = true;
    t.explosionRound = state.round;
    t.type = "safe";
    t.initialMine = t.scannedInitialMine = false;
    const lethal = GameRules.suddenDeath();
    state.log = `${p.name} triggers a mine${lethal ? " during Sudden Death: instant death!" : " and loses 1 HP!"}`
      + GameRules.damage(p, lethal ? p.hp : 1);
    return state.log;
  } else {
    GridVisibility.reveal(t);
  }
  return "";
}

// Round lifecycle. Health and terrain persist; rolls, programs, and dodge reset.
function finishRound() {
  if (checkWinner()) return;

  state.round++;
  GridVisibility.expire();
  // A triggered mine stays marked for the rest of its round, then becomes a
  // safe grid whose visibility follows the selected mode. Wall-demolition
  // craters have no explosion expiry stamp but still follow visibility rules.
  state.board.forEach(tile => {
    if (Number.isInteger(tile.explosionRound) && tile.explosionRound < state.round) {
      tile.exploded = false;
      delete tile.explosionRound;
    }
  });
  state.phase = "rolling";
  state.planningIndex = 0;
  state.awaitingHandoff = false;
  state.executionIndex = 0;
  state.allocationCounter = 0;
  state.agentFailures.clear();
  state.queue = [];
  deniedTile = null;
  state.players.forEach(p => {
    p.program = [];
    p.dodge = false;
    p.roll = null;
    p.pointsRemaining = 0;
  });

  el("resolveNextBtn").textContent = "Resolve Next Action";
  DicePhase.begin();
}

function checkWinner() {
  const result = GameMutators.get(state.config.mutatorId).getResult(state);
  if (result) {
    state.phase = "winner";
    DicePhase.cancel();
    GameAgents.cancel();
    el("botControls").classList.add("hidden");
    el("planningControls").classList.add("hidden");
    el("passControls").classList.add("hidden");
    el("executionControls").classList.add("hidden");
    el("winnerControls").classList.remove("hidden");

    el("winnerTitle").textContent = result.title;
    el("winnerText").textContent = result.text;
    state.log = result.log;
    render();
    return true;
  }
  return false;
}

function formatAction(a) {
  const base = ACTIONS[a.action].label;
  return a.dir ? `${base} ${DIRS[a.dir].symbol}` : base;
}

function diceSymbol(value) {
  return ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value] || "—";
}

function activePlayer() {
  if (!state) return null;
  if (state.phase === "rolling") return DicePhase.current();
  if (state.phase === "planning") return currentPlanner();
  if (state.phase === "execution") {
    const item = state.queue[state.executionIndex];
    return item ? state.players.find(p => p.id === item.playerId && p.alive) || null : null;
  }
  return null;
}

// Rendering reads state without advancing the game. Derive small summaries
// afresh instead of caching game data that can become stale after an action.
function bombCounts() {
  let remaining = 0, found = 0;
  for (const tile of state.board) {
    if (tile.type !== "mine") continue;
    remaining++;
    if (tile.revealed) found++;
  }
  return {remaining, found};
}

function render() {
  if (!state) return;
  el("roundLabel").textContent = state.round;
  el("phaseLabel").textContent =
    state.phase === "rolling" ? "Dice Rolls" : state.phase === "planning" ? "Planning" :
    state.phase === "execution" ? "Execution" : "Finished";

  el("currentPlayerLabel").textContent = activePlayer()?.name || "—";
  const bombs = bombCounts();
  el("bombStats").textContent =
    `${bombs.remaining} bomb${bombs.remaining === 1 ? "" : "s"} / ${bombs.found} found`;
  el("message").textContent = state.log;
  el("pressureHint").textContent = GameRules.suddenDeath()
    ? "SUDDEN DEATH: bombs kill instantly. Blocked-push damage remains 1 HP."
    : `Sudden Death begins in round ${GameRules.suddenDeathRound} (${GameRules.suddenDeathRound - state.round} rounds away): bombs become lethal.`;
  el("pressureHint").classList.toggle("sudden-death", GameRules.suddenDeath());

  renderPlayers();
  renderBoard();
  renderQueue();
  TurnOrder.render();
  ExecutionView.render();
  DicePhase.render();

  if (state.phase === "planning") updatePlanningUI();
}

function renderPlayers() {
  el("playerList").innerHTML = "";
  const activeId = activePlayer()?.id;
  TurnOrder.players().forEach(p => {
    const isActive = p.alive && p.id === activeId;
    const showHearts = p.alive && p.hp < 5;
    const healthLabel = p.alive ? `${p.hp} of ${state.config.startingHp} HP` : "Eliminated";
    const healthDisplay = !p.alive ? "ELIMINATED"
      : showHearts ? "♥".repeat(p.hp) : `${p.hp} / ${state.config.startingHp} HP`;
    const card = document.createElement("div");
    card.className = "player-card" + (p.alive ? "" : " dead") + (isActive ? " active" : "");
    card.innerHTML = `
      <span class="player-identity">
        <span class="active-player-cube p${p.id}${isActive ? "" : " inactive"}" ${isActive ? 'role="img" aria-label="Active player" title="Active player"' : 'aria-hidden="true"'}></span>
        <span class="player-name">${p.name}</span>
      </span>
      <span class="hp${showHearts ? " hearts" : ""}" role="img" aria-label="${healthLabel}" title="${healthLabel}">${healthDisplay}</span>
    `;
    if (GameAgents.isBot(p)) {
      const badge = document.createElement("small");
      badge.className = "bot-badge";
      badge.textContent = MinefieldAgents.get(p.controller)?.label || "Agent";
      card.appendChild(badge);
    }
    el("playerList").appendChild(card);
  });
}

function renderBoard() {
  const board = el("board");
  // Reuse the grid and its click listeners across renders and new games. Resolve
  // a clicked tile by index so listeners never retain a previous game's board.
  if (boardCells.length !== state.board.length) {
    board.innerHTML = "";
    boardCells.length = 0;
    state.board.forEach((_, index) => {
      const cell = document.createElement("div");
      cell.addEventListener("click", () => {
        if (state) selectBoardTile(state.board[index]);
      });
      boardCells.push(cell);
      board.appendChild(cell);
    });
  }

  // Index living tokens once instead of filtering every player for every tile.
  const playersByTile = new Map();
  for (const player of state.players) {
    if (!player.alive) continue;
    const key = tileKey(player.x, player.y);
    if (!playersByTile.has(key)) playersByTile.set(key, []);
    playersByTile.get(key).push(player);
  }

  const planner = state.phase === "planning" ? currentPlanner() : null;
  const planningActive = planner && !GameAgents.isBot(planner) && planner.roll !== null && planner.pointsRemaining > 0;
  const previewPosition = planningActive ? plannedPosition(planner) : null;
  const reachable = planningActive && (!selection.action || selection.action === "MOVE")
    ? movementPaths(planner)
    : null;
  const selectedPath = new Set();
  const scan = SCAN_RULES[selection.action];
  const scanRegion = new Set(
    planningActive && scan
      ? scan.region(previewPosition, selection.dir).map(tile => tileKey(tile.x, tile.y))
      : []
  );
  const disarmRegion = new Set(
    planningActive && selection.action === "DISARM" && selection.target
      ? [tileKey(selection.target.x, selection.target.y)]
      : []
  );

  if (planningActive && selection.action === "MOVE" && selection.path.length) {
    const cursor = {...previewPosition};
    selection.path.forEach(name => {
      cursor.x += DIRS[name].dx;
      cursor.y += DIRS[name].dy;
      selectedPath.add(tileKey(cursor.x, cursor.y));
    });
  }

  state.board.forEach((t, index) => {
    const cell = boardCells[index];
    // Clear transient highlights, tooltips, and tokens before updating this cell.
    cell.className = "tile";
    cell.textContent = "";
    cell.title = "";
    const key = tileKey(t.x, t.y);

    if (t.type === "wall") {
      cell.classList.add("wall");
      cell.textContent = "▣";
    } else if (t.type === "ridge") {
      cell.classList.add("ridge");
      cell.textContent = "▲";
    } else if (t.revealed && t.exploded) {
      cell.classList.add("exploded");
      cell.textContent = "✹";
    } else if (t.revealed && t.type === "mine") {
      cell.classList.add("mine");
      cell.textContent = "◆";
      if (t.scannedInitialMine) {
        cell.classList.add("found-mine");
        cell.title = "Scanned initial bomb — stays visible until disarmed or triggered";
      }
    } else if (t.revealed) {
      cell.classList.add("safe");
      cell.textContent = "";
    }

    const path = reachable ? reachable.get(key) : null;
    if (path && path.length > 0) {
      cell.classList.add("move-reachable");
      cell.title += `${cell.title ? "; " : ""}Reachable in ${path.length} point${path.length === 1 ? "" : "s"}`;
    }
    if (selectedPath.has(key)) cell.classList.add("planned-path");
    if (scanRegion.has(key)) cell.classList.add("scan-region");
    if (disarmRegion.has(key)) cell.classList.add("disarm-region");
    if (selection.target && selection.target.x === t.x && selection.target.y === t.y && planningActive) {
      cell.classList.add("selected-target");
    }
    if (deniedTile && deniedTile.key === key) cell.classList.add("denied-target");

    if (Number.isInteger(t.clueCount)) {
      const clue = document.createElement("span");
      clue.className = `scan-clue clue-${t.clueCount}`;
      clue.textContent = String(t.clueCount);
      clue.title = `Round ${t.clueRound}: ${t.clueCount} bombs in the eight neighboring grids. Snapshot; this grid is not necessarily safe.`;
      cell.title += `${cell.title ? "; " : ""}${clue.title}`;
      cell.appendChild(clue);
    }

    const playersHere = playersByTile.get(key);
    if (playersHere) {
      const stack = document.createElement("div");
      stack.className = "token-stack";
      playersHere.forEach(p => {
        const token = document.createElement("div");
        token.className = `token p${p.id}`;
        token.textContent = `P${p.id}`;
        token.title = `${p.name} - ${p.hp} HP`;
        stack.appendChild(token);
      });
      cell.appendChild(stack);
    }

    if (
      planningActive &&
      previewPosition.x === t.x &&
      previewPosition.y === t.y &&
      (previewPosition.x !== planner.x || previewPosition.y !== planner.y)
    ) {
      const token = document.createElement("div");
      token.className = `token p${planner.id} planned-token`;
      token.textContent = `P${planner.id}`;
      token.title = `${planner.name}'s planned position`;
      cell.appendChild(token);
    }

  });
}

function renderQueue() {
  if (!state || state.phase !== "execution") return;
  const q = el("executionQueue");
  q.innerHTML = "";
  // Only completed entries expose their action; the next entry shows its owner.
  state.queue.slice(0, state.executionIndex).forEach(item => {
    const p = state.players.find(x => x.id === item.playerId);
    const row = document.createElement("div");
    row.className = "queue-item done";
    const category = allocationType(item.action);
    if (category !== "move" && category !== "discard") {
      row.className += ` action-colored log-${category}`;
    }
    if (item.eventType) row.classList.add(item.eventType);
    row.textContent =
      `Step ${item.step + 1} · ${p ? p.name : "Player"} · ${formatAction(item)}` +
      (item.eventText ? ` · ${item.eventText}` : "");
    row.title = item.resultLog || "";
    q.appendChild(row);
  });

  const current = state.queue[state.executionIndex];
  if (current) {
    const p = state.players.find(x => x.id === current.playerId);
    const row = document.createElement("div");
    row.className = "queue-item current";
    row.textContent = `Next · ${p ? p.name : "Player"} · Hidden action`;
    q.appendChild(row);
  }

  const queueFinished = state.executionIndex >= state.queue.length;
  el("resolveNextBtn").disabled = false;
  el("resolveNextBtn").textContent = queueFinished ? "Finish Round" : "Resolve Next Action";
  el("resolveAllBtn").disabled = queueFinished;
  q.scrollTop = q.scrollHeight;
}
