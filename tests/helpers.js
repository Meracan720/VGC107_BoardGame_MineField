const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const source = ["bots.js", "game-agents.js", "turn-order.js", "execution-view.js", "grid-visibility.js", "dice-phase.js", "mutators.js", "game-rules.js", "game.js"]
  .map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

// Small DOM substitute for logic tests, not a browser layout engine. Timers are
// controlled by each test so denial animations can be checked without sleeping.
function element() {
  const node = {
    value: "", textContent: "", className: "", disabled: false,
    children: [], dataset: {}, style: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    appendChild(child) { this.children.push(child); },
    click() { if (!this.disabled) this.listeners.click?.(); },
  };
  node.classList = {
    contains(name) { return node.className.split(/\s+/).includes(name); },
    add(name) { if (!this.contains(name)) node.className += ` ${name}`; },
    remove(name) { node.className = node.className.split(/\s+/).filter(x => x !== name).join(" "); },
    toggle(name, force) {
      const on = force ?? !this.contains(name);
      if (on) this.add(name); else this.remove(name);
      return on;
    },
  };
  let markup = "", text = "";
  Object.defineProperty(node, "textContent", {
    get() { return text + node.children.map(child => child.textContent).join(""); },
    set(value) { text = String(value); markup = ""; node.children = []; },
  });
  Object.defineProperty(node, "innerHTML", {
    get() { return markup; },
    set(value) { markup = value; text = ""; node.children = []; },
  });
  return node;
}

function game(settings = {}) {
  const {emptyBoard = false, ...setup} = settings;
  const timers = [];
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], element()]));
  const buttons = [...html.matchAll(/data-action="([^"]+)"/g)].map(match => {
    const button = element();
    button.dataset.action = match[1];
    return button;
  });
  // Rules tests use an explicit three-human fixture, independent of UI defaults.
  const initial = {playerCount: "3", humanCount: "all", turnOrderMode: "manual", startingHp: "3",
    terrainCount: "0", ridgeCount: "0", bombPercent: "3", terrainType: "wall", ...setup};
  for (const [id, value] of Object.entries(initial)) elements.get(id).value = value;
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id) || null,
      querySelectorAll: selector => selector === "[data-action]" ? buttons : [],
      createElement: element,
    },
    assert,
    AbortController,
    clearTimeout(id) { timers[id] = null; },
    setTimeout(callback) { timers.push(callback); return timers.length - 1; },
  });
  const run = script => vm.runInContext(script, context);
  run(source);
  // Drive the real public dice phase synchronously for action/rules fixtures.
  // Production bot timers are cancelled by each roll; no game functions are stubbed.
  run(`function completeDicePhase() {
    while (state?.phase === "rolling" && DicePhase.current()) rollDice();
    DicePhase.startPlanning();
  }`);
  run("startGame(); state.board = makeBoard();");
  // Most action fixtures need an ongoing match. Keep a distant real bomb so
  // zero-bomb victory does not end unrelated queue and round tests early.
  // Count/clearance tests opt into an empty board and place their own bombs.
  if (!emptyBoard) run('tileAt(4, 9).type = "mine";');
  return {run, elements, timers, button: action => buttons.find(b => b.dataset.action === action)};
}
module.exports = {game, html};
