# Minefield Protocol — Local Browser Prototype

Author Notes:  
- Author:  Gary (Jiaxing Chen)
- Proeject Name: MindField Protocol
- Project for: VGC 107 - History of Video Games; A4 Board Game Prototype
- Last Update:  Sep 17, 2026

## Game Introduction

An offline, pass-and-play board game built with plain HTML, CSS, and JavaScript.

- 3–6 seats, with human players and optional local bots
- 10 × 10 board
- players program actions before execution
- actions resolve later in player order
- hidden minefield
- last survivor wins, or clear every bomb to decide victory by surviving HP
- mines become lethal from round 21

## Run it

No installation is required.

1. Open `index.html` in Chrome, Edge, or Firefox. If downloaded as a ZIP, extract it first.
2. Choose 3–6 players, set starting health (1–10 HP), and configure the terrain and bomb density.
3. Select **Start Game**, roll in playing order, then select **Begin Planning**.
   Pass the computer between human players during private planning.

### Play solo against bots

Set **Human players** to **1 human — play solo**, choose a **Bot difficulty**, and start
the game. You control Player 1; bots fill the other seats. The total Players setting
still controls the number of seats (3–6). You can also choose two or more humans for
a mixed game, or **All players (pass-and-play)** for the original mode.

- **New Player:** wanders, takes risks, and sometimes misses tactical opportunities.
- **Moderate:** pursues opponents, routes around visible mines, and takes useful pushes.
- **Expert:** favors safer routes, prepares unknown ground with Disarm, and prioritizes
  pushes into visible mines, defensive dodges, and nearby bomb placements.

These are local rule-based policies; they need no Internet, API key, or installation.
All levels receive the same visible information and cannot inspect hidden mines or
other players' private programs through the agent interface. Dice rolls are public. Difficulty describes
their strategy, not a measured skill rating or a guarantee of winning.

Bots automatically roll in the public dice phase, then program privately during planning.
**Resolve Next Action** and **Resolve Remaining** still let you control execution.
Solo games skip the pass screen; mixed games retain it between human players.
If you are eliminated, you can watch the remaining bots using the execution buttons,
or select **New Game**. Bot settings persist when returning to setup.

Custom synchronous or asynchronous agents can register through the JavaScript interface
in [AGENTS_API.md](AGENTS_API.md). No external AI service is connected by default.

### Mutators

The **Mutators** list at the top of setup selects the game mode. Each selectable card
shows a mode title with a short description on the next line. The current mode is
**Last Survivor** — *The last standing WINS.* It is selected by default. A match also
ends when every bomb has been cleared, with the highest-HP survivor winning and ties
sharing victory. Additional modes can be added in future updates.

Mode definitions live in `mutators.js`: each entry has an `id`, `title`, `description`,
and `getResult(game)` function. Setup cards are generated from this list. `getResult`
returns `null` while play continues, or `{title, text, log}` when the game ends.
The chosen ID is stored in `state.config.mutatorId`; future mechanisms beyond victory
conditions should be implemented in the appropriate engine lifecycle/action functions.

### Playing sequence and public dice rolls

In setup, choose **Designated order** to assign each turn using the player selectors.
Selecting a player already assigned to another turn swaps the two positions, so every
player appears exactly once. The controls adapt to the selected total of 3–6 players.
Choose **Random order** to shuffle the sequence once when starting a new match.

The sequence applies to both private planning and each execution step, stays fixed
across rounds, and skips eliminated players. Player numbers, colors, bot assignments,
and starting corners remain attached to their original seats. The Players panel shows
the current playing order. Mixed games still show a handoff before the next human when
bots occur between humans in the sequence.

Before planning **each round**, living players roll a d6 in that same order. Humans
select **Roll for Player …**, and bots roll automatically. A compact display above the
player cards shows `P1 P2 P3 P4` with each roll in a cube below its player label. These
numbers remain public during planning and execution; pending rolls show `—`.
After all rolls are complete, **Begin Planning** opens the first player's private
program. Rolls cannot be changed during planning. A new round clears the display
and starts another ordered dice phase, skipping eliminated players.

During **Execution Phase**, compact stacks of 32-pixel cubes in the control panel show
each player in playing order, using the same style as the planning allocation cubes.
Each header shows the player number, die face, and numeric roll. Stack height follows
that player's roll: grey `*` cubes are pending, and blank cubes are resolved and colored
by action type. There are no cubes beyond a player's roll. Two-point actions
mark two slots resolved together; the execution order still advances one action at a time.
Pending slots never reveal an action's type or cost.

The next living player to execute has a blinking blue column outline. Reduced-motion
settings use a steady outline. Full action descriptions and damage events remain in the
expandable **Execution log** below the buttons. Only programmed actions remain private during planning.
A player eliminated during this round retains their displayed roll; players eliminated
before the round show **No roll**.

Defaults: **4 players, 1 human, Moderate bots, random playing sequence, 5 HP each,
Default grid visibility (2 rounds), Walls terrain with 16 of the maximum 20 wall tiles
(80%), and 20% bombs**. No ridges
are generated in Walls mode.
All settings remain configurable. New Game returns to setup with the last selected settings;
reloading the page restores the defaults.

Because it uses only HTML/CSS/JavaScript, it works from a normal `file://` path and does not require Node.js or a local web server.

### Grid visibility

Choose **Grid visibility** at setup:

- **Clear:** explored grids stay known for the whole game.
- **Default:** grids become unknown after two rounds. A grid revealed in round 1
  stays known through round 2 and becomes unknown at the start of round 3.
- **Hard:** grids become unknown after one round. A grid revealed in round 1
  becomes unknown at the start of round 2.

Moving onto a grid (including being pushed or dodging), triggering a mine, checking a
grid with Disarm, or breaking a wall reveals that grid and refreshes its visibility timer.
Starting grids begin known in round 1. Staying on a grid does not refresh its timer.
Walls and ridges remain visible terrain. These rules apply equally to humans and bots.

Scan Here and 3×3 Scan record numbered clues without revealing grid contents. Each clue counts
bombs in the eight neighboring grids, excluding its own grid, and records the scan
round. A numbered grid can itself contain a bomb. Clues follow the selected visibility
lifetime independently of grid knowledge: Clear retains them, Default expires them
after two rounds, and Hard after one. Moving onto a grid does not refresh its clue.
Rescanning replaces the number and its scan round. 3-Grid Scan instead reveals bombs directly and clears numbered clues in its area. Found initial bombs stay highlighted until removed; revealed planted bombs follow the visibility setting. Non-bomb grids keep their knowledge state.

Knowledge is separate from grid contents: planting changes neither the known/unknown
status nor the last reveal round. A bomb planted on a known grid is visible until that
grid's existing visibility timer expires; a bomb planted on an unknown grid stays
hidden. Planting, disarming, and explosions also leave existing clue numbers unchanged;
those numbers describe the board when scanned. Visibility expiry hides information
without removing bombs or changing terrain.

## Current prototype rules

Each player:

- starts with the selected health (1–10 HP per player, default 5);
- publicly rolls one six-sided die for action points before planning each round;
- secretly spends all rolled points on a variable-length action program;
- cannot see the other players' selected actions during planning.

On desktop, round details and player health appear in the left sidebar, with the board in the
center and compact action controls on the right. Add sits above the queued actions so the growing
program does not push it down. Each player card shows one heart per remaining HP below 5 HP,
and current / starting HP at 5 or more. A player-colored square marks the current planner or
the living player whose action is next during execution.

Round Details also shows live bomb counts, such as `30 bombs / 15 found`. The first number
includes every bomb still on the board; found counts the revealed bombs among them.
Numbered scan clues do not count as found bombs. Planting, explosions, and disarming
update these counts as actions resolve. At the start
of a new round, visibility expiry updates the found count without changing the bomb total.

Actions:

- **Move (1 point per grid)** — click any highlighted reachable destination; movement can use all 8 directions.
- **Attack (1 point)** — reach up to 2 grids straight or 1 diagonally and push the nearest player 1 grid in that direction. Walls and ridges block the attack ray. If terrain or the board edge prevents the push, the target loses 1 HP. Another player blocks a push without causing damage.
- **Dodge (1 point)** — choose any adjacent direction and prepare a sidestep against the next attack this round. The sidestep avoids the push if its destination is free; bombs on that grid still trigger. A blocked sidestep consumes the dodge and the attack continues. A later Dodge replaces the earlier direction; unused dodges expire at round end.
- **Disarm (1 point, in the Dodge / Disarm group)** — check one adjacent grid in any of 8 directions and remove its bomb safely. The checked grid becomes known safe. There are no flags.
- **Plant Bomb (1 point)** — plant on an adjacent non-terrain grid (up, down, left, or right), preserving visibility. Cannot break walls.
- **Break Wall (2 points)** — destroy an adjacent wall (up, down, left, or right). Cannot plant bombs. After adding a wall break to your program, later moves can select a path through that grid. The actual wall is removed only when the action executes; ridges are immune.
- **Scan Here (1 point)** — record a clue on your current grid counting bombs in its 8 neighboring grids; no direction is needed.
- **3-Grid Scan (2 points)** — reveal bombs directly in a three-grid wedge in any of 8 directions, without numbers.
- **3×3 Scan (3 points)** — choose any of 8 directions and record a clue on each grid in a full 3×3 region in that direction.
- **Discard Remaining** — secretly allocate any unused points to no-effect actions.

Move, Attack, Dodge, and Disarm support diagonals. Plant Bomb and Break Wall remain limited to up,
down, left, and right. All players roll before anyone chooses actions. Rolls are public;
point allocation and programmed actions remain private while planning.

There is no separate direction control. For Move, Attack, Dodge, Disarm, Plant Bomb, Break Wall, and directional Scan actions,
select the action and then click the intended grid on the board.

The board highlights every destination reachable with the player's remaining points. Selecting a
destination creates a shortest movement path, preferring straight steps before diagonal steps
(for example, `→ → ↘`), and shows the selected grid in yellow. Walls and ridges may require a
different step order. You can also add straight and diagonal movement segments separately;
each new segment starts from the end of your queued moves. Every grid still costs 1 point.
If another player occupies a movement destination when that step executes, the step is
spent and skipped. Later steps continue from your actual position; they are not rerouted.
Blocked or out-of-range selections flash red. The private allocation tracker uses `_` for available points and
`*` for allocated points—for example, a roll of 6 changes from `_ _ _ _ _ _` to `* * * _ _ _`
after allocating 3 points to movement.

The tracker always displays six cubes. Cubes outside the current roll are dark, usable points are
grey, Movement allocations are yellow, Scan allocations are green, Attack is orange, and Dodge / Disarm is
blue. Bomb uses red and discarded points use dark grey. Before a movement is confirmed, the chosen
path previews its point cost in text and marks the pending cubes with yellow `+` symbols.

Selecting Disarm lets you choose one adjacent grid, shown in blue. It checks that direction
from the player's actual position when the action resolves. A bomb is removed without damage;
an empty grid is verified safe. Disarm cannot clear walls or ridges and still costs 1 point
when no bomb is present. Use clues to choose which grid to disarm instead of placing flags.

The 3-Grid Scan costs 2 points and reveals bombs directly: cardinal directions select a three-wide adjacent edge, while a
diagonal direction selects the three grids forming that corner. The 3×3 Scan costs 3 points.
Each grid selected by 3×3 Scan gets its own dated clue counting bombs in that grid's eight neighbors,
excluding the center. At board edges, only neighboring grids on the board are counted.
Walls do not block scans or clue counts. Numbered scans do not reveal bomb positions or prove a
clue's center safe. Every scan previews its footprint; a complete directional scan
region must fit on the board. Stored numbers change only when rescanned, so later bomb
placement, disarming, or explosions can make a clue outdated. Discarded
points fill the allocation tracker like other spent points and remain in the hidden execution
sequence, so another player cannot identify unused points during planning.

Board:

- 10 × 10.
- default setup: 16 walls and 20% hidden bombs;
- hidden bombs are configurable from 3% up to the remaining board capacity;
- 0–20 wall tiles and 0–2 connected ridge lines of up to five grids can be generated;
- walls and ridges block movement, but walls can be destroyed with Break Wall while ridges are indestructible;
- mines deal 1 HP in rounds 1–20 and are consumed after exploding; from round 21,
  triggering a mine kills the player regardless of HP.
- A triggered mine's explosion marker lasts for the rest of that round. At the start
  of the next round the marker clears, allowing bomb placement again. The grid is safe;
  whether it stays known follows the selected visibility mode.
- safe tiles become known when entered or checked with Disarm; planting preserves the grid's knowledge and timer.

Execution:

1. Every living player rolls publicly in order, then privately programs all action points.
2. The first programmed action resolves for all players in player order.
3. Later programmed actions continue resolving in the same order until all programs are empty.
4. Actions remain hidden until they resolve.
5. Check victory after every action. The last living player wins immediately. If more
   than one remains and there are no bombs left, the survivor with the highest HP wins;
   equal highest HP shares victory. Every bomb must be cleared, including player-planted bombs.
6. Otherwise, start the next round. From round 21 onward, **Sudden Death** makes triggered
   mines lethal. Collision damage from an attack remains 1 HP. Round 20 is not a hard deadline.

The execution log automatically follows the newest action. Scans use green, attacks orange,
Dodge / Disarm blue, and bombs red; movement stays neutral. HP-loss events receive an orange
warning highlight, while player eliminations receive a stronger red highlight. Expand
**Rules & explanations** in Round Details for a reminder of combat, clues, and victory rules.

## Code guide

There is no build step, package installation, server, or framework. The script is loaded after
the HTML so all controls exist before event handlers are registered.

| File | Responsibility |
| --- | --- |
| `index.html` | Setup inputs, board container, player/status sidebar, and phase controls. |
| `style.css` | Responsive layout, player colors, allocation cubes, and feedback animations. |
| `game.js` | Rules, map generation, private planning, action resolution, and rendering. |
| `game-rules.js` | Directional combat and disarming, numbered clue snapshots, Sudden Death, and bomb-clearance victory. |
| `bots.js` | Independent bot policies and the extensible agent registry. |
| `game-agents.js` | Bot setup, redacted observations, action validation, async turns, and cancellation. |
| `turn-order.js` | Designated/random setup order and the public playing sequence. |
| `execution-view.js` | Dice/point table, resolved point tracking, and current player column. |
| `grid-visibility.js` | Clear/Default/Hard setup, reveal timestamps, and independent expiry of grid knowledge and clue snapshots. |
| `dice-phase.js` | Ordered public rolls, automatic bot rolls, the public points display, and the transition to planning. |
| `mutators.js` | Selectable mode titles/descriptions and mode-specific victory conditions; currently Last Survivor. |
| `AGENTS_API.md` | Versioned interface and adapter examples for future AI integrations. |
| `tests/game.test.js` | Automated rules and UI-state regression tests using Node's built-in test runner. |
| `tests/bots.test.js` | Solo/mixed flows, bot decisions, privacy, invalid responses, timeout, and cancellation tests. |
| `tests/turn-order.test.js` | Player sequence, bot/human handoffs, and dice visibility tests. |
| `tests/execution-view.test.js` | Point table sizing, action-cost accounting, privacy, and current column checks. |
| `tests/grid-visibility.test.js` | Reveal expiry, refreshed knowledge, planting invariance, and agent visibility checks. |
| `tests/dice-phase.test.js` | Ordered rolls, planning gates, immutable rolls, eliminated players, and cancelled bot timers. |
| `tests/game-rules.test.js` | Collision damage, reactive Dodge, Sudden Death boundaries, bomb-clearance winners, skipped moves, and clue snapshots. |
| `tests/helpers.js` | Shared lightweight DOM and controlled timer test harness. |

### State and phases

`state` owns the board, players, setup configuration, round number, and execution queue.
Each player stores health, position, die roll, remaining points, and a private `program`.
`selection` is an unconfirmed action preview; choosing a grid does not change the board or spend points.

- Setup has no active game (`state === null`). `startGame()` generates the board and begins the dice phase.
- Rolling gives every living player one public roll in playing order; Begin Planning is enabled only when all rolls are ready.
- Planning lets each living player build a private program using their assigned roll and pass the computer. The pass screen
  is part of planning, not a separate game phase.
- Execution uses `beginExecution()` to interleave programs by step, then player order.
- `finishRound()` resets programs, dice, and dodge, expires grid knowledge and clues according to
  the visibility mode, and clears triggered-mine explosion markers while retaining health and contents.
  It then starts the next round's public dice phase.
- `checkWinner()` delegates to the selected mutator after each action. Last Survivor
  ends immediately when at most one player remains alive or no bombs remain; clearing
  the bombs compares living players' HP and allows shared victories.

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
   discards into one item per unused point. Non-movement actions occupy one queue item regardless of point cost.
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
- Scan geometry is independent of terrain. Directional scan footprints must fit fully on the
  board; each clue counts only the neighbors that exist on the board. Scan Here uses the
  player's current grid. Disarm and Dodge choose a single adjacent direction.
- The public execution log exposes completed actions and only the next player's name, never their
  pending action. Keep that distinction when adding new UI.
- Rendering may update DOM elements but must not spend points, move players, or advance the queue.
- Denial feedback uses an identity check so an older animation timer cannot clear a newer warning.

## Testing and maintenance

Playing needs only a browser. Running automated tests needs Node.js 20 or later, with no extra packages.
From the project directory:

```sh
node --check game.js
node --check game-rules.js
node --check bots.js
node --check game-agents.js
node --check turn-order.js
node --check execution-view.js
node --check grid-visibility.js
node --check dice-phase.js
node --check mutators.js
node --test tests/game.test.js tests/bots.test.js tests/turn-order.test.js tests/execution-view.test.js tests/grid-visibility.test.js tests/dice-phase.test.js tests/attack.test.js tests/game-rules.test.js
```

The tests cover setup defaults and bounds, movement ordering and costs, scan clues through walls,
disarming, wall breaking, health display, player indicators, bomb counts, Undo, queue privacy,
single-step/batch equivalence, and board reuse across new games. They use a small DOM substitute
and controlled timers; they do **not** verify browser layout, CSS animations, or accessibility behavior.

After UI changes, also check in a browser:

1. Start a default game and confirm the setup values, hearts, and bomb count.
2. Roll for everyone, begin planning, select a mixed straight/diagonal move, check its preview, add it, and undo it.
3. Preview all scan shapes near walls and edges, then confirm clue counts, scan rounds,
   and that scanning does not reveal bomb positions. Change a nearby bomb and confirm
   the clue stays unchanged until rescanned.
4. Break a wall, disarm a selected bomb, and verify counters and health after execution.
   Try terrain-blocked pushes, player-blocked pushes, and successful/blocked directional dodges.
5. Pass between players, compare the two execution buttons, and start a new game without reloading.
6. Select one human, try each bot level, and confirm bot plans stay hidden until execution.
7. Try two humans plus bots; confirm the human handoff, then watch bots after a human is eliminated.
8. Try designated and random orders with 3–6 players, including bots before/between humans;
   confirm rolls appear in the public cubes before planning and execution follows that order.

To add an action, update `ACTIONS`, its HTML button, allocation category/hint, and `executeAction()`.
Add scan geometry to `SCAN_RULES` if applicable, document its cost here, and test both planning and
execution. When changing defaults, update both the JavaScript fallback constants and HTML values.

## Prototype limitations

- The game has no persistence, accounts, remote AI service, or network multiplayer.
- Bots use heuristics and optimistic forecasts; pushes, blocked moves, and other players' actions
  can invalidate a plan. Sudden Death makes mines lethal from round 21, but there is no hard
  turn limit or stalemate rule, so matches without mine triggers can still last a long time.
- Privacy is pass-and-play screen privacy, not a security boundary: developer tools can inspect state.
- Path previews account for your own queued wall breaks. Undoing a wall break restores its
  movement restriction. Other players' programs stay private and do not affect your preview;
  pushes or blocked moves during execution can still prevent a planned break or movement.
- UI sizing and placement assume a 10 × 10 board; changing `SIZE` alone is not enough to resize it.
