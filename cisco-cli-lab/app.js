"use strict";

const terminal = document.getElementById("terminal");
const promptEl = document.getElementById("prompt");
const input = document.getElementById("commandInput");
const deviceType = document.getElementById("deviceType");
const title = document.getElementById("terminalTitle");
const results = document.getElementById("results");
let engine = new CiscoCliEngine(deviceType.value);

function line(text, className = "output") {
  const el = document.createElement("div");
  el.className = `line ${className}`;
  el.textContent = text;
  terminal.appendChild(el);
  terminal.scrollTop = terminal.scrollHeight;
}

function banner() {
  line("Cisco IOS Software, Classroom Simulator");
  line("Press ENTER or begin typing a command.");
  line("");
}

function syncPrompt() { promptEl.textContent = engine.prompt(); }

function runCommand(command) {
  if (!command.trim()) return;
  line(`${engine.prompt()} ${command}`, "command");
  const response = engine.execute(command);
  if (response.output) line(response.output, response.output.startsWith("%") || response.output.includes("Invalid input") ? "error" : "output");
  syncPrompt();
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const command = input.value;
    input.value = "";
    runCommand(command);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (engine.history.length) {
      engine.historyIndex = Math.max(0, engine.historyIndex - 1);
      input.value = engine.history[engine.historyIndex] || "";
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    engine.historyIndex = Math.min(engine.history.length, engine.historyIndex + 1);
    input.value = engine.history[engine.historyIndex] || "";
  }
});

document.querySelector(".terminal-card").addEventListener("click", () => input.focus());
document.getElementById("clearButton").addEventListener("click", () => { terminal.textContent = ""; input.focus(); });
document.getElementById("resetButton").addEventListener("click", () => {
  if (!confirm("Reset the device and erase the student's work?")) return;
  engine.reset(deviceType.value);
  terminal.textContent = "";
  results.hidden = true;
  banner(); syncPrompt(); input.focus();
});
deviceType.addEventListener("change", () => {
  engine.reset(deviceType.value);
  title.textContent = `${deviceType.options[deviceType.selectedIndex].text} console`;
  terminal.textContent = "";
  results.hidden = true;
  banner(); syncPrompt(); input.focus();
});

document.getElementById("checkButton").addEventListener("click", () => {
  const grade = engine.grade();
  results.hidden = false;
  if (grade.passed === grade.total) {
    results.className = "results success";
    results.innerHTML = `<strong>Lab complete: ${grade.passed}/${grade.total}</strong><br>All device requirements are satisfied.`;
  } else {
    results.className = "results incomplete";
    const failed = grade.checks.filter(item => !item.ok).map(item => `<li>${item.name} requirement is not yet satisfied.</li>`).join("");
    results.innerHTML = `<strong>Not complete: ${grade.passed}/${grade.total}</strong><ul>${failed}</ul>`;
  }
});

banner();
syncPrompt();
