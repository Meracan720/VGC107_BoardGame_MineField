<!--
Author: Gary (JiaxingChen)
Project: VGC107 - Board Game Term Project
Last Update: 2026-09-20
Publish Version: v0.3.1
-->

# Minefield agent interface — version 2

`bots.js` contains the local policies and `MinefieldAgents` registry. `game-agents.js`
connects registered providers to the engine. These are classic browser scripts, so
the existing offline `file://` workflow needs no module loader or build step.

This is an in-page JavaScript extension interface, not an HTTP server. It is the
integration point for a future local process or hosted AI adapter. No network requests
are made by the built-in bots.

## Register and select an agent

Load a custom script after `bots.js` and before `game.js`:

```html
<script src="bots.js"></script>
<script src="my-agent.js"></script>
<script src="game-agents.js"></script>
<script src="turn-order.js"></script>
<script src="execution-view.js"></script>
<script src="grid-visibility.js"></script>
<script src="dice-phase.js"></script>
<script src="game-rules.js"></script>
<script src="mutators.js"></script>
<script src="game.js"></script>
```

For example, `my-agent.js` can contain this minimal agent:

```js
MinefieldAgents.register("my-agent", {
  label: "My Agent",
  chooseAction(observation, {signal}) {
    return observation.legalActions.find(a => a.action === "MOVE")
      || {action: "DISCARD", dir: null};
  },
});
```

Choose fewer human players than total seats, then select **My Agent** in the Bot
difficulty menu. Every bot seat uses the selected provider. Registered providers are
also picked up when setup controls change. To refresh after registering in the browser
console, call `updateSetupConfig()` while on the setup screen.

- `MinefieldAgents.version` is `2`.
- `MinefieldAgents.list()` returns detached `{id, label}` entries.
- `MinefieldAgents.get(id)` returns the provider, or `undefined`.
- `MinefieldAgents.register(id, {label, chooseAction})` adds a provider; duplicate IDs
  are rejected. IDs match `/^[a-z][a-z0-9-]{0,39}$/`.
- Built-in IDs are `new-player`, `moderate`, and `expert`.

Version 2 changes the action contract: `DODGE` and `DISARM` require an adjacent
direction, and `SCAN` now costs 1 point and records a numbered clue on the current
grid. Update version 1 adapters to select these actions from `legalActions` and
interpret scan results as dated clues, rather than revealed tile contents.

## Observation

`chooseAction` receives a fresh JSON-serializable snapshot for each action choice:

| Field | Meaning |
| --- | --- |
| `version` | Contract version, currently `2`. |
| `size`, `round` | Board width/height and current round. Coordinates start at 0. |
| `turnOrder` | Public array of player IDs in the match's playing sequence; skip eliminated players. |
| `visibilityMode` | `clear` (no expiry), `default` (2 rounds), or `hard` (1 round). |
| `mutatorId` | Selected game mode; currently `last-survivor`. |
| `suddenDeath` | Whether triggered mines are lethal; true from round 21 onward. Attack collision damage remains 1 HP. |
| `self` | Own `id`, actual `x/y`, `hp`, public `roll`, private `pointsRemaining`, and accepted `program` (`{action, dir}` entries). |
| `position` | Predicted `x/y` after own queued moves, matching human movement previews. |
| `players` | Public `{id, x, y, hp, alive, roll}` for each player, including eliminated players. A player eliminated before this round has `roll: null`. |
| `board` | Row-major tiles: `{x, y, type, exploded, clueCount, clueRound}`. `type` is `unknown`, `safe`, `mine`, `wall`, or `ridge`. `exploded` is false for unknown grids. `clueCount` and `clueRound` are null when no unexpired scan clue exists. |
| `bombs` | Public aggregate counts: `{remaining, found}`. |
| `directions` | Direction-name mapping to `{dx, dy}`. |
| `legalActions` | Currently valid individual choices: `{action, dir, cost}`, with `target: {x,y}` for directional choices and `region: [{x,y}, ...]` for scans and attacks. |

Unrevealed safe tiles and mines both become `unknown`. Terrain is public. Other
players' programs, allocation data, pending execution entries, and private log
messages are omitted. Mutating an observation does not change engine state or the
engine's validation list.

Grid knowledge expires at round boundaries in Default and Hard modes, including safe
and mine grids. A reveal in round R expires at the start of R+2 (Default) or R+1 (Hard).
Clear mode retains knowledge. Planting preserves both visibility and its timer: a mine
planted on a known grid stays visible until that knowledge expires. Expired grids are
redacted just like unexplored grids; remaining bomb totals stay public.

Scan Here records public clues without revealing tile contents. `clueCount` is the
number of bombs in the tile's eight neighbors, excluding the tile itself, as observed
in `clueRound`. A tile may have a clue while its `type` remains `unknown`; a numbered
tile is not necessarily safe. Walls do not block counting, and missing neighbors at
board edges contribute nothing. Planting, disarming, and explosions do not update
stored clues. Only rescanning refreshes the count and scan round.

Every starting tile receives a public clue before the first roll, without spending points.
During execution, paid Scan Here also grants one adjustment to the next already-programmed
Move that round. Adjustments do not stack. Humans choose when the Move reaches its turn;
bots (including custom adapters) use the engine's automatic public-information movement
choice. This does not call the planning provider again or alter any other queued actions.

Clues expire independently of tile knowledge using the same visibility duration:
R+2 for Default, R+1 for Hard, and no expiry for Clear. Entering a tile or checking it
with Disarm refreshes tile knowledge but not its clue. 3-Grid Scan instead reveals bombs directly and clears numbers in its area; 3×3 Scan also reveals safe grids throughout its nine-grid area. Both permanently highlight found initial bombs until removed. Safe grids and planted bombs follow normal visibility expiry. The `bombs.found` count includes only
currently revealed bombs, not bombs inferred from numbered clues.

`position` follows your queued moves. Movement choices in `legalActions` also treat
walls targeted by your earlier queued BREAK_WALL actions as passable. `board` still shows
the actual current terrain. Previews do not simulate other players' moves, pushes, or
occupancy. A listed action is legal to **program**, not guaranteed to succeed when it
executes. Scans reveal results during execution, never between planning calls.

## Return one action

Return `{action, dir}` or a Promise resolving to that object. Returning an entry from
`legalActions` is also supported; extra properties such as `cost` are ignored.
Direction may be omitted or `null` for nondirectional actions.

| Action | Cost | Direction |
| --- | --- | --- |
| `MOVE` | 1 | Any of eight directions; one grid per call. |
| `ATTACK` | 1 | Up to 2 grids cardinally, 1 diagonally; nearest player is pushed 1 grid. Walls/ridges block the ray. `region` lists reachable grids in order; `target` is the first grid for aiming. A terrain/edge-blocked push deals 1 HP; a player-blocked push deals no damage. |
| `DODGE` | 1 | Any of eight directions; prepare a one-grid sidestep against the next attack this round. |
| `DISARM` | 1 | Any of eight directions; safely check and remove a bomb from one adjacent grid. |
| `BOMB` | 1 | Cardinal only; plants a mine on non-terrain grids; cannot break walls. |
| `BREAK_WALL` | 2 | Cardinal only; destroys a wall; cannot plant mines or destroy ridges. |
| `SCAN` | 1 | None; record a neighboring-bomb clue and allow one adjustment to the next programmed Move this round. |
| `TRI_SCAN` | 2 | Any of eight directions; reveal bombs directly in three grids, without numbers. Full region must fit. |
| `AREA_SCAN` | 3 | Any of eight directions; reveal bombs and safe grids in a 3×3 region, without numbers. Full region must fit. |
| `DISCARD` | 1 | None; discards **one** point per agent call. |

Direction names: `UP`, `DOWN`, `LEFT`, `RIGHT`, `UP_LEFT`, `UP_RIGHT`, `DOWN_LEFT`,
`DOWN_RIGHT`. Prefer the provided legal list rather than duplicating geometry rules.

Dodge stores a direction, not an absolute destination. The next attack attempts a
sidestep from the player's actual position. A successful sidestep avoids the push
and triggers the destination tile normally, including lethal mines during Sudden
Death. A blocked sidestep consumes the dodge and the attack continues. Dodges do not
stack: a later Dodge replaces the direction, and unused dodges expire at round end.

A queued Dodge also protects against attacks by earlier players in the same execution
step. Such a response consumes that Dodge immediately (including blocked attempts);
its normal queue slot does not arm it again. Later-step Dodges cannot respond early.

Disarm checks one adjacent grid from the player's actual position. It removes any
bomb safely and reveals the resulting safe grid, or verifies a grid without a bomb.
There is no flag action. A movement step into an occupied grid is spent and skipped;
later queued steps execute from the actual position without rerouting.

Last Survivor checks victory after each executed action. A sole survivor wins
immediately. If multiple players remain and all bombs have been removed, including
player-planted bombs, the highest-HP survivor wins; equal highest HP shares victory.
Starting in round 21, mine triggers kill regardless of HP. This is Sudden Death,
not a fixed round limit.

The engine rolls once for every player in a separate public phase, then requests each bot's choices sequentially until all points
are spent, and charges costs itself. Each action remains one execution item regardless of its point cost.
Bots' plans enter the same step-major queue as human plans and are revealed only as
each action resolves. There is no public method for setting HP, dice, terrain, or
another player's program.

## Async adapters and recovery

An adapter can await a local backend, for example through a function supplied by your
integration:

```js
MinefieldAgents.register("remote-agent", {
  label: "External Agent",
  async chooseAction(observation, {signal}) {
    // requestAction is supplied by your adapter, not by this game.
    return await requestAction(observation, {signal});
  },
});
```

The engine allows **10 seconds for an entire bot program**, not per action. Illegal
responses, thrown errors, rejected Promises, or a timeout cause remaining points to
be discarded. Accepted earlier choices remain queued. Execution displays a generic
failure notice without exposing private choices.

The supplied `AbortSignal` is aborted on completion, failure, timeout, or New Game.
Pass it to asynchronous requests so they can stop promptly. Results from a cancelled
or replaced game are ignored. Synchronous blocking code cannot be preempted by this
timer; adapters must remain responsive.

For a future network integration, serve the page with a local backend as needed for
browser networking restrictions, keep service API keys in that backend, and transmit
only this observation. The adapter is trusted JavaScript running in the same page:
redaction prevents accidental information leakage through the API but is not a
sandbox against malicious scripts with direct access to the page's global scope.
