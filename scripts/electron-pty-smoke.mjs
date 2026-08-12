import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import electron from "electron";

if (process.argv[2] !== "--child") {
  const result = spawnSync(electron, [fileURLToPath(import.meta.url), "--child"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    timeout: 20_000
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { spawn } = await import("node-pty");
  const shell = process.platform === "win32" ? process.env.COMSPEC ?? "powershell.exe" : process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  const marker = `openshell-electron-pty-${process.pid}`;
  const pty = spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" }
  });
  let output = "";
  const timeout = setTimeout(() => {
    console.error(`Electron PTY smoke timed out: ${output}`);
    pty.kill();
    process.exitCode = 1;
  }, 10_000);
  pty.onData((data) => {
    output += data;
  });
  pty.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    if (exitCode !== 0 || !output.includes(marker)) {
      console.error(`Electron PTY smoke failed (${exitCode}): ${output}`);
      process.exitCode = 1;
    }
  });
  pty.write(process.platform === "win32" ? `echo ${marker}\r\nexit\r\n` : `printf '${marker}\\n'\nexit\n`);
}
