# Game evaluation — September 19, 2026

The core engine is functioning consistently in the checks performed. The largest
remaining risks are match completion, defensive balance, and map connectivity.
This is a promising playable prototype, but Last Survivor needs another balance
pass before longer play sessions. Passing unit tests does not establish that a
match will end or that the bot levels are well balanced.

## Evidence and scope

- All 89 existing regression tests passed before this review.
- Simulated 15 complete or capped games: five seeded games per bot level, each
  capped at 60 rounds, using four seats, five HP, 16 walls, 20 bombs, random order,
  and Default visibility. All seats were controlled by the same bot level to
  exercise the engine automatically; these are **not human-versus-bot results**.
- Those simulations exercised 900 rounds and 10,411 executed actions. Assertions
  checked action budgets, living-player overlap, terrain occupancy, board bounds,
  health/alive consistency, and permanent discovery markers. No assertion failures
  or agent failures occurred.
- Generated 3,000 maps: 1,000 each for Walls, Ridges, and Random Mix, with six seats,
  20 walls where applicable, and two ridge lines where applicable. Checked exact
  placement counts, safe starting squares, movement access, and connectivity even
  after treating every breakable wall as passable.
- Ran focused reproductions for hidden-crater information, final-allocation Undo,
  and a beginner bot surrounded by walls.

The small deterministic match sample is useful for finding problems, not estimating
win rates or proving a difficulty ranking. Browser layout, animation, keyboard
navigation, and real human play were not tested in this evaluation. The existing
browser-access restriction prevents visual verification here.

## Confirmed findings

### High: ridge generation can permanently separate starting players

`game.js`, `placeLongRidges()`, accepts individually valid lines without checking
the connectivity of the finished map. Six of the 1,000 Ridges fixtures and the
same six Random Mix fixtures separated starting players even when walls were
treated as removable. This is a test-fixture count, not a population estimate.

Reproduction: `node tests/audit-maps.js 1000`; seed 37 has vertical ridge tiles at
(4,5)…(4,9) and horizontal ridge tiles at (5,7)…(9,7), separating the bottom-right
starting area from the rest of the board. Coordinates are zero-based. Ridges cannot
be destroyed and block attacks. Survivors in separate regions cannot fight each
other, which can produce a stalemate.

**Recommended fix:** reject/regenerate ridge arrangements unless all starting
positions share one connected region using the game's actual eight-direction
movement rules. Separately consider guaranteeing an initial escape route.

### Medium: New Player bots cannot escape breakable-wall enclosures

`bots.js`, the New Player candidate filter, excludes Bomb / Break Wall whenever
Move, Dodge, or 3-Grid Scan choices exist. Dodge is always available with a point,
so the fallback never rescues a boxed-in bot. A six-point roll can produce only
scans/dodges while the bot remains surrounded by breakable walls.

Reproduced at (9,9) with walls at (8,9), (9,8), and (8,8). The generated-map sweep
found 29 fully movement-blocked starting seats in Walls fixtures and 107 in Random
Mix fixtures, out of 6,000 seats per configuration. These are seats, not matches.
Other players could free the bot, but its own policy cannot.

**Recommended fix:** add a basic escape rule before the difficulty-specific action
filter. Beginner should mean weaker tactics, not inability to use a necessary rule.

### Medium: legal actions disclose a hidden crater

`game-agents.js:66` excludes Bomb based on the real `tile.exploded`, even when the
observation reports that tile as `unknown` with `exploded: false`. Destroy a wall,
let its visibility expire in Hard mode, then inspect an adjacent bot's legal
actions: Bomb is missing in that direction, revealing a restriction that the board
observation hid. Human target rejection also exposes this restriction.

This reveals hidden crater status, **not arbitrary unseen mine locations**.

**Recommended fix:** decide whether crater restrictions are permanently public. If
yes, display and expose them consistently. If they are private after expiry, permit
programming attempts on unknown grids and validate the physical restriction at
execution time. Do not silently disclose it through the legal-choice list.

### Usability: the last allocation cannot be undone through the UI

`game.js`, `confirmProgram()`, hides planning controls as soon as points reach zero.
On a one-point roll, the first action immediately removes access to Undo. In solo
play it can also immediately begin bot planning. This follows the current flow,
but makes the existing Undo feature unavailable precisely when reviewing a
completed program would be useful.

**Recommended change:** keep a completed program editable until an explicit
“Lock program” / “Ready” action. Preserve privacy after that commitment.

## Mechanism and balance findings

| Bot level | Winners by round 60 | Average HP lost across all four players per match | Longest interval without damage |
| --- | ---: | ---: | ---: |
| New Player | 1 / 5 | 17.0 | 29 rounds |
| Moderate | 0 / 5 | 15.0 | 24 rounds |
| Expert | 0 / 5 | 4.4 | 46 rounds |

All five Expert matches still had all four players alive after 60 rounds. Expert
bots planted 477 bombs and disarmed 536 bombs across the five matches, yet caused
only 22 total HP loss. Initial map bombs account for removals beyond new plantings.

The likely contributors, supported by the rules and action counts:

1. **Defense is much cheaper than replenishing danger.** Disarm clears up to eight
   surrounding bombs for one point; planting one costs two. Disarm is one immediate
   execution item, too. Expert's preference for preparing unknown ground reinforces
   this defensive loop. Trial either a smaller Disarm area or a higher cost first.
2. **Attacks cannot finish a safe-board fight.** They push one square but do no
   direct damage; blocked pushes also do no damage. Increasing range improves
   contact without necessarily increasing elimination pressure. Harmless pushing
   and dodging can continue indefinitely.
3. **There is no deadline or pressure rule.** Consider a round cap with a stated
   result, or a future sudden-death mutator. A cap would prevent endless sessions;
   it would not by itself fix combat incentives.
4. **Scans compete with a cheaper safety action.** Nearby scans reveal danger while
   Disarm removes it. Scans still have value for distant information and preserving
   mines as traps, so they are not universally inferior. Their cost/value relationship
   needs human testing, particularly now that found starting bombs stay visible.
5. **Fixed initiative deserves a separate fairness test.** Acting first can push a
   player before Dodge or movement executes. Randomizing once distributes this
   advantage across matches but preserves it within a match. Rotating the first
   player each round is worth testing as an optional rule, not an assumed fix.

The strongest parts are the shared action-point system, readable public dice,
private programming, interleaved resolution, and the distinction between terrain
and knowledge. These give players meaningful prediction decisions. Avoid changing
all the costs at once: first fix connectivity and bot escape, then test one Disarm
change and one endgame rule in short human sessions.

## Changes made during this review

Added reproducible audit scripts and saved simulation results. Gameplay rules and
bot policies were left unchanged so findings remain reproducible.

Per the additional request, resolved execution-log entries now use the allocation
colors: green for scans, orange for attacks, blue for Dodge/Disarm, and red for
Bomb/Break Wall. Movement and discarded points keep neutral styling. Unresolved
actions remain hidden; damage and elimination emphasis takes precedence.

## Reproduce

```sh
node --test tests/game.test.js tests/bots.test.js tests/attack.test.js tests/dice-phase.test.js tests/execution-view.test.js tests/grid-visibility.test.js tests/turn-order.test.js
node tests/audit-probes.js
node tests/audit-maps.js 1000
node tests/audit-simulation.js 5 60
```

The simulation writes `tests/audit-results.json`. The probes assert the current
problem behavior; they are diagnostic reproductions, not regression tests declaring
that behavior desirable. Update them when the corresponding issues are fixed.
