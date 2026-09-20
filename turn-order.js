/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

/* Match order. Player IDs, colors, and
 * starting positions stay attached to their original seats. */
const TurnOrder = (() => {
  let designated = [];

  function setup(count, humans) {
    // Keep valid existing choices when the player count changes, then append
    // new seats. Every seat occurs exactly once, including after a swap.
    designated = designated.filter(id => id <= count);
    for (let id = 1; id <= count; id++) {
      if (!designated.includes(id)) designated.push(id);
    }
    const mode = el("turnOrderMode");
    if (mode.value !== "manual") mode.value = "random";
    el("turnOrderHint").textContent = mode.value === "random"
      ? "The order is shuffled once when the game starts and kept for the whole match. See the playing order in the Players panel."
      : "Choose who goes first, second, and so on. Selecting a player swaps their position. This order applies to planning and execution for the whole match.";
    const controls = el("manualTurnOrder");
    controls.classList.toggle("hidden", mode.value === "random");
    controls.innerHTML = "";
    designated.forEach((id, index) => {
      const label = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = `Turn ${index + 1}`;
      const select = document.createElement("select");
      for (let seat = 1; seat <= count; seat++) {
        const option = document.createElement("option");
        option.value = String(seat);
        option.textContent = `${seat <= humans ? "Player" : "Bot"} ${seat}`;
        select.appendChild(option);
      }
      select.value = String(id);
      select.addEventListener("change", () => {
        const other = designated.indexOf(Number(select.value));
        if (other < 0) return;
        [designated[index], designated[other]] = [designated[other], designated[index]];
        setup(count, humans);
      });
      label.appendChild(title);
      label.appendChild(select);
      controls.appendChild(label);
    });
    return {turnOrderMode: mode.value, designatedOrder: [...designated]};
  }

  function resolve(config) {
    // Fisher–Yates runs only on Start Game, never on a setup preview or round.
    const order = [...config.designatedOrder];
    if (config.turnOrderMode === "random") {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    return order;
  }

  function players() {
    return state.turnOrder.map(id => state.players.find(p => p.id === id));
  }

  function render() {
    const ordered = players();
    el("turnOrderSummary").textContent = "Playing order: " + ordered.filter(p => p.alive).map(p => p.name).join(" → ");
  }

  return Object.freeze({setup, resolve, players, render});
})();
