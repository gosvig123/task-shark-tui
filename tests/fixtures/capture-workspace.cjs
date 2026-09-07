// Test-only frame capture from the real blessed screen inside a pseudo-terminal.
const fs = require('node:fs');
const blessed = require('blessed');
const original = blessed.screen;
blessed.screen = (...args) => {
  const screen = original(...args), render = screen.render.bind(screen);
  screen.render = () => {
    render();
    if (process.env.WORKSPACE_FRAME) fs.writeFileSync(process.env.WORKSPACE_FRAME, screen.screenshot());
  };
  return screen;
};
