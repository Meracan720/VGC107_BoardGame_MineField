/*
 * Author: Gary (JiaxingChen)
 * Project: VGC107 - Board Game Term Project
 * Last Update: 2026-09-20
 * Publish Version: v0.3.1
 */

/* Public execution progress. Pending slots depend only on the public die roll;
 * action costs and descriptions appear here only after the action resolves. */
const ExecutionView = (() => {
  function render() {
    const executing = state.phase === "execution";
    const headers = el("executionRolls");
    const body = el("executionPoints");
    headers.innerHTML = "";
    body.innerHTML = "";
    el("executionProgress").textContent = "";
    if (!executing) return;

    const players = TurnOrder.players();
    const current = state.queue[state.executionIndex];
    const active = current && players.find(p => p.id === current.playerId && p.alive);
    const completed = new Map(players.map(p => [p.id, []]));
    for (const item of state.queue.slice(0, state.executionIndex)) {
      for (let point = 0; point < ACTIONS[item.action].cost; point++) {
        completed.get(item.playerId).push(item);
      }
    }

    players.forEach(p => {
      const header = document.createElement("th");
      header.scope = "col";
      header.className = "execution-player" + (active?.id === p.id ? " executing-player" : "");
      header.title = `${p.name} · ` + (p.roll === null ? "No roll" : `${diceSymbol(p.roll)} ${p.roll}`)
        + (p.alive ? "" : " · Eliminated");
      const name = document.createElement("span");
      name.textContent = `P${p.id}`;
      const roll = document.createElement("small");
      roll.textContent = (p.roll === null ? "No roll" : `${diceSymbol(p.roll)} ${p.roll}`)
        + (p.alive ? "" : " · Out");
      header.appendChild(name);
      header.appendChild(roll);
      headers.appendChild(header);
    });

    const height = Math.max(0, ...players.map(p => p.roll || 0));
    for (let point = 0; point < height; point++) {
      const row = document.createElement("tr");
      players.forEach(p => {
        const cell = document.createElement("td");
        const hasPoint = point < (p.roll || 0);
        const item = completed.get(p.id)[point];
        cell.className = "execution-point";
        if (!hasPoint) {
          cell.classList.add("no-point");
          cell.title = `${p.name} did not roll this point.`;
        } else {
          const cube = document.createElement("span");
          cube.className = "allocation-cell execution-cube " + (item ? `point-${allocationType(item.action)}` : "usable");
          if (item && (item.emptyAction || (item.action === "DODGE" && !item.dodgeTriggered))) {
            cube.classList.add("point-empty");
          }
          cube.textContent = item ? "" : "*";
          cell.classList.add(item ? "point-resolved" : "point-pending");
          cell.title = item
            ? `${p.name} · Point ${point + 1} · ${formatAction(item)} · ${item.resultLog || "Resolved"}`
            : `${p.name} · Point ${point + 1} · ${p.alive ? "Hidden action" : "Awaiting elimination skip"}`;
          cube.title = cell.title;
          cell.appendChild(cube);
          if (item?.eventType) cell.classList.add(item.eventType);
          if (active?.id === p.id) cell.classList.add("executing-player");
          if (point === p.roll - 1) cell.classList.add("last-point");
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    }
    el("executionProgress").textContent = state.pendingScanMove
      ? `${active.name}: choose your scan-adjusted Move on the board or keep the programmed direction.`
      : current
      ? active ? `Next: ${active.name}. Programmed actions stay hidden until they resolve.`
        : "Next: skip an eliminated player's action."
      : "All actions resolved. Finish the round to continue.";
  }
  return Object.freeze({render});
})();
