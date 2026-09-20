/* Mode definitions live here so future mutators can add their own title,
 * description, and victory condition without changing the setup list. */
const GameMutators = (() => {
  const modes = [Object.freeze({
    id: "last-survivor",
    title: "Last Survivor",
    description: "The last standing WINS.",
    getResult(game) {
      const living = game.players.filter(player => player.alive);
      if (living.length > 1) return GameRules.clearanceResult(game);
      return living.length === 1 ? {
        title: `${living[0].name} Wins!`,
        text: `Last survivor after ${game.round} round${game.round === 1 ? "" : "s"}.`,
        log: `${living[0].name} is the last survivor.`,
      } : {
        title: "No Survivors",
        text: "Everybody was eliminated.",
        log: "No players survived.",
      };
    },
  })];
  const inputs = [];

  function setup() {
    if (!inputs.length) {
      const list = el("mutatorList");
      modes.forEach((mode, index) => {
        const label = document.createElement("label");
        label.className = "mutator-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "mutator";
        input.value = mode.id;
        input.checked = index === 0;
        const copy = document.createElement("span");
        const title = document.createElement("span");
        title.className = "mutator-title";
        title.textContent = mode.title;
        const description = document.createElement("span");
        description.className = "mutator-description";
        description.textContent = mode.description;
        copy.appendChild(title);
        copy.appendChild(description);
        label.appendChild(input);
        label.appendChild(copy);
        list.appendChild(label);
        inputs.push(input);
      });
    }
    const selected = inputs.find(input => input.checked) || inputs[0];
    selected.checked = true;
    return {mutatorId: selected.value};
  }

  function get(id) { return modes.find(mode => mode.id === id) || modes[0]; }
  return Object.freeze({setup, get});
})();
