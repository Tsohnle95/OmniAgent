import { spawn } from "node:child_process";
import type { TuiCommand } from "./tui-command";

function kittyTitle(sessionID: string): string {
  return `Orbit TUI · ${sessionID}`;
}

export function kittyLaunchArgs(directory: string, command: TuiCommand, sessionID: string): { executable: string; args: string[] } {
  const kittyArgs = ["--directory", directory, "--title", kittyTitle(sessionID), command.command, ...command.args];
  if (process.platform === "darwin") {
    return { executable: "open", args: ["-n", "-a", "Kitty", "--args", ...kittyArgs] };
  }
  return { executable: "kitty", args: kittyArgs };
}

export function launchKittyTui(
  directory: string,
  command: TuiCommand,
  sessionID: string,
  spawnProcess: typeof spawn = spawn
): Promise<void> {
  const launch = kittyLaunchArgs(directory, command, sessionID);
  return new Promise<void>((resolve, reject) => {
    const child = spawnProcess(launch.executable, launch.args, { detached: true, stdio: "ignore" });
    const fail = (error: Error): void => reject(error);
    child.once("error", fail);
    if (process.platform === "darwin") {
      child.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Kitty could not be opened${code === null ? "" : ` (exit code ${code})`}`));
      });
    } else {
      resolve();
    }
    child.unref();
  });
}
