import { describe, expect, it, vi } from "vitest";
import { kittyLaunchArgs, launchKittyTui } from "./kitty";

const command = { command: "opencode2", args: ["--session", "session-1"] };

describe("Kitty TUI launcher", () => {
  it("passes the workspace and runtime command without a shell", () => {
    const launch = kittyLaunchArgs("/repo with spaces", command, "session-1");

    if (process.platform === "darwin") {
      expect(launch).toEqual({
        executable: "open",
        args: ["-n", "-a", "Kitty", "--args", "--directory", "/repo with spaces", "--title", "Orbit TUI · session-1", "opencode2", "--session", "session-1"]
      });
    } else {
      expect(launch).toEqual({
        executable: "kitty",
        args: ["--directory", "/repo with spaces", "--title", "Orbit TUI · session-1", "opencode2", "--session", "session-1"]
      });
    }
  });

  it("resolves after macOS confirms the Kitty app launch", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const child = {
      once: vi.fn((event: string, callback: (...args: unknown[]) => void) => { listeners.set(event, callback); }),
      unref: vi.fn()
    };
    const spawnProcess = vi.fn(() => child);
    const pending = launchKittyTui("/repo", command, "session-1", spawnProcess as never);
    if (process.platform === "darwin") listeners.get("exit")?.(0);
    await pending;

    expect(spawnProcess).toHaveBeenCalledWith(
      process.platform === "darwin" ? "open" : "kitty",
      expect.any(Array),
      { detached: true, stdio: "ignore" }
    );
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
