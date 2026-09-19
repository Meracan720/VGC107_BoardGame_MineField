# Minefield Protocol — Local Browser Prototype

Author Notes:  
- Author:  Gary (Jiaxing Chen)
- Proeject Name: MindField Protocol
- Project for: VGC 107 - History of Video Games; A4 Board Game Prototype
- Last Update:  Sep 17, 2026

## Game Introduction

An offline, pass-and-play board game built with plain HTML, CSS, and JavaScript.

- 3–6 players
- 10 × 10 board
- players program actions before execution
- actions resolve later in player order
- hidden minefield
- last survivor wins

## Run it

No installation is required.

1. Open `index.html` in Chrome, Edge, or Firefox. If downloaded as a ZIP, extract it first.
2. Choose 3–6 players, set starting health (1–10 HP), and configure the terrain and bomb density.
3. Select **Start Game**, then pass the computer between players during the Planning Phase.

Defaults: **3 players, 3 HP each, 12 walls, 25% bombs**, and one five-grid ridge in Random Mix mode.
All settings remain configurable. New Game returns to setup with the last selected settings;
reloading the page restores the defaults.

Because it uses only HTML/CSS/JavaScript, it works from a normal `file://` path and does not require Node.js or a local web server.

## Current prototype rules

Each player:

- starts with the selected health (1–10 HP per player, default 3);
- privately rolls one six-sided die for action points each round;
- secretly spends all rolled points on a variable-length action program;
- cannot see the other players' selected actions during planning.

On desktop, round details and player health appear in the left sidebar, with the board in the
center and compact action controls on the right. Add sits above the queued actions so the growing
program does not push it down. Each player card shows one heart per remaining HP below 5 HP,
and current / starting HP at 5 or more. A player-colored square marks the current planner or
the living player whose action is next during execution.

Round Details also shows live bomb counts, such as `30 bombs / 15 found`. The first number
includes every bomb still on the board; found counts the revealed bombs among them. Scans,
planting, explosions, and disarming update these counts as actions resolve, not during planning.

Actions:

- **Move (1 point per grid)** — click any highlighted reachable destination; movement can use all 8 directions.
- **Attack (1 point)** — attack an adjacent player and push them 1 tile.
- **Dodge (1 point)** — cancel the next attack that would hit you during the round.
- **Disarm (1 point, in the Dodge / Disarm group)** — remove all bombs within one grid of the player, including diagonals, without detonating them. No direction is needed.
- **Bomb / Break Wall (2 points)** — select an adjacent wall (up, down, left, or right) to break it, or a legal grid to plant a hidden mine. The wall is removed when the action executes, opening the grid for movement; ridges are immune.
- **Scan Around (2 points)** — reveal the radius-1 grids surrounding the player, up to 8 grids; no direction is needed.
- **3-Grid Scan (1 point)** — scan a three-grid wedge in any of 8 directions.
- **3×3 Scan (2 points)** — choose any of 8 directions and reveal a full 3×3 region in that direction.
- **Discard Remaining** — secretly allocate any unused points to no-effect actions.

Move can travel horizontally, vertically, or diagonally. Attack and Bomb remain limited to up,
down, left, and right. A player must roll before choosing actions, and their roll and allocation
remain private while planning.

There is no separate direction control. For Move, Attack, Bomb, and directional Scan actions,
select the action and then click the intended grid on the board.

The board highlights every destination reachable with the player's remaining points. Selecting a
destination creates a shortest movement path, preferring straight steps before diagonal steps
(for example, `→ → ↘`), and shows the selected grid in yellow. Walls and ridges may require a
different step order. You can also add straight and diagonal movement segments separately;
each new segment starts from the end of your queued moves. Every grid still costs 1 point.
Blocked or out-of-range selections flash red. The private allocation tracker uses `_` for available points and
`*` for allocated points—for example, a roll of 6 changes from `_ _ _ _ _ _` to `* * * _ _ _`
after allocating 3 points to movement.

The tracker always displays six cubes. Cubes outside the current roll are dark, usable points are
grey, Movement allocations are yellow, Scan allocations are green, Attack is orange, and Dodge / Disarm is
blue. Bomb uses red and discarded points use dark grey. Before a movement is confirmed, the chosen
path previews its point cost in text and marks the pending cubes with yellow `+` symbols.

Selecting Disarm outlines its radius in blue. It clears bombs around the player's position when
the action resolves (up to eight grids, clipped at board edges). Removed bombs become visible safe
tiles; walls, ridges, and other tiles are unaffected. A disarm still costs 1 point if no bombs are found.

The 3-Grid Scan costs 1 point: cardinal directions reveal a three-wide adjacent edge, while a
diagonal direction reveals the three grids forming that corner. The radius and 3×3 scans cost
2 points. Walls do not block any scan: tiles around or behind them are revealed if they fall
inside the scan region, without breaking the walls. Every scan previews its covered grids.
A complete directional scan region must fit on the board. Discarded
points fill the allocation tracker like other spent points and remain in the hidden execution
sequence, so another player cannot identify unused points during planning.

Board:

- 10 × 10.
- default setup: 12 walls and 25% hidden bombs;
- hidden bombs are configurable from 3% up to the remaining board capacity;
- 0–20 wall tiles and 0–2 connected ridge lines of up to five grids can be generated;
- walls and ridges block movement, but walls can be destroyed with Bomb while ridges are indestructible;
- mines deal 1 HP and are consumed after exploding.
- safe tiles become visible when entered or scanned; a newly planted bomb is hidden again.

Execution:

1. Every living player privately rolls and spends all action points.
2. The first programmed action resolves for all players in player order.
3. Later programmed actions continue resolving in the same order until all programs are empty.
4. Actions remain hidden until they resolve.
5. Start the next round; the last living player wins.

The execution log automatically follows the newest action. HP-loss events receive an orange warning
highlight, while player eliminations receive a stronger red highlight.

## Code guide

There is no build step, package installation, server, or framework. The script is loaded after
the HTML so all controls exist before event handlers are registered.

| File | Responsibility |
| --- | --- |
| `index.html` | Setup inputs, board container, player/status sidebar, and phase controls. |
| `style.css` | Responsive layout, player colors, allocation cubes, and feedback animations. |
| `game.js` | Rules, map generation, private planning, action resolution, and rendering. |
| `tests/game.test.js` | Automated rules and UI-state regression tests using Node's built-in test runner. |

### State and phases

`state` owns the board, players, setup configuration, round number, and execution queue.
Each player stores health, position, die roll, remaining points, and a private `program`.
`selection` is an unconfirmed action preview; choosing a grid does not change the board or spend points.

- Setup has no active game (`state === null`). `startGame()` generates the board and begins planning.
- Planning lets each living player roll once, build a program, and pass the computer. The pass screen
  is part of planning, not a separate game phase.
- Execution uses `beginExecution()` to interleave programs by step, then player order.
- `finishRound()` resets programs, dice, and dodge while retaining health and the board.
- `checkWinner()` ends the game immediately when at most one player remains alive.

### Major logic sections

1. **Rules and defaults:** `ACTIONS` defines point costs and direction restrictions. `SCAN_RULES`
   shares scan shapes between target validation, board previews, and execution. Static hint and
   allocation-label tables avoid rebuilding these lookups on every render.
2. **Setup and map generation:** `updateSetupConfig()` validates inputs and returns the exact config
   used by `startGame()`, keeping the preview and generated game consistent. Starting grids are
   reserved before ridges, walls, and bombs are placed. Fisher–Yates shuffling samples placements
   without replacement; ridge candidates use a set of eligible tiles for quick membership checks.
3. **Movement and scan geometry:** the board is a flat, row-major array, so `tileAt(x, y)` is a direct
   lookup at `y * SIZE + x`. `movementPaths()` uses breadth-first search because every move costs
   one point. It visits straight directions first to break shortest-path ties, stops at the remaining
   point budget, and advances a queue index instead of repeatedly shifting the queue. Search visits
   each reachable grid once; the stored paths are bounded by the six-point budget.
4. **Allocation and Undo:** `confirmProgram()` expands movement into one queue item per grid and
   discards into one item per unused point. A two-point scan or bomb is still one queue item, not two.
   `allocationId` groups the steps from one choice so Undo refunds that entire choice.
5. **Execution:** `resolveQueuedAction()` handles one item, including eliminated-player skips,
   health-change recording, and index advancement. Both execution buttons use it, so single-step
   and batch resolution follow the same rules. Batch resolution checks victory after every item
   and renders only when a winner or the next round is ready.
6. **Rendering:** the 100 board cells and their click handlers are created once and reused. Handlers
   look up the current board by index, so New Game cannot leave stale tile references. Player tokens
   are indexed by grid once per render rather than filtering every player for every cell. Bomb
   counts are derived in one pass, avoiding counters that could drift after scans or explosions.

### Important boundaries

- Planning uses terrain and the player's queued movement, not hidden bomb locations or other players'
  current positions. `canEnter()` checks live occupancy when movement actually executes. Paths are
  predictions: pushes, blocked movement, and earlier actions can change the eventual result.
- Scan geometry is independent of terrain. Only directional scan footprints must fit fully on the
  board; Scan Around and Disarm clip at edges.
- The public execution log exposes completed actions and only the next player's name, never their
  pending action. Keep that distinction when adding new UI.
- Rendering may update DOM elements but must not spend points, move players, or advance the queue.
- Denial feedback uses an identity check so an older animation timer cannot clear a newer warning.

## Testing and maintenance

Playing needs only a browser. Running automated tests needs Node.js 20 or later, with no extra packages.
From the project directory:

```sh
node --check game.js
node --test tests/game.test.js
```

The tests cover setup defaults and bounds, movement ordering and costs, scans through walls,
disarming, wall breaking, health display, player indicators, bomb counts, Undo, queue privacy,
single-step/batch equivalence, and board reuse across new games. They use a small DOM substitute
and controlled timers; they do **not** verify browser layout, CSS animations, or accessibility behavior.

After UI changes, also check in a browser:

1. Start a default game and confirm the setup values, hearts, and bomb count.
2. Roll, select a mixed straight/diagonal move, check its preview, add it, and undo it.
3. Preview all scan shapes near walls and edges, then confirm their resolved coverage.
4. Break a wall, disarm bombs, and verify counters and health after execution.
5. Pass between players, compare the two execution buttons, and start a new game without reloading.

To add an action, update `ACTIONS`, its HTML button, allocation category/hint, and `executeAction()`.
Add scan geometry to `SCAN_RULES` if applicable, document its cost here, and test both planning and
execution. When changing defaults, update both the JavaScript fallback constants and HTML values.

## Prototype limitations

- The game has no persistence, accounts, AI players, or network multiplayer.
- Privacy is pass-and-play screen privacy, not a security boundary: developer tools can inspect state.
- Path previews do not simulate earlier bomb/wall effects or other players' actions. Movement through
  a wall becomes available after it has actually been destroyed.
- UI sizing and placement assume a 10 × 10 board; changing `SIZE` alone is not enough to resize it.
