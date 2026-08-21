# OpenShell

OpenShell is a desktop workspace for the [OpenCode](https://opencode.ai/v2)
coding agent. Open a project, describe what you want to build, and watch the
agent work while you review the files it changes.

## What You Get

- **Live agent timeline** — streamed answers, exploration, tool calls,
  subagents, todos, and permission requests.
- **Project workspace** — file explorer, Monaco editor, tabs, autosave, and an
  integrated terminal.
- **Reviewable changes** — a Changes list and Edit/Diff views for files changed
  during a session.
- **Session continuity** — recent sessions, saved workspaces, and concurrent
  model panels.
- **Front-end tooling** — Emmet support plus W3C HTML and CSS validation in the
  editor.
- **Local desktop app** — Electron opens projects from your machine and
  connects to the local OpenCode service.

## How It Works

1. Open a folder or an individual file.
2. Choose an agent and model, then send a prompt. Attach files or reference
   workspace files with `@`.
3. Follow the agent's progress in the timeline.
4. Review changes in the editor or Diff view, then continue, edit, validate, or
   stop the session.

## Requirements

- macOS, Linux, or Windows
- Node 22.23.2 or later within the Node 22 release line
- [`opencode2`](https://opencode.ai/v2) on your `PATH`, or an OpenCode service
  already running

## Run From Source

```sh
git clone https://github.com/Tsohnle95/OpenShell.git
cd OpenShell
npm install
npm run dev
```

OpenShell discovers the OpenCode service and starts it automatically when
needed. Select **Open a folder** when the app opens.

## Build And Install

```sh
npm run build          # compile and launch
npm run build:compile  # compile only
npm start              # launch the existing build
npm run pack           # package OpenShell.app on macOS
```

On macOS, the Welcome screen also includes **Install app**, which installs the
packaged app into `/Applications`.

## Development Checks

```sh
npm test
npm run check
```

`npm run check` runs typechecking, tests, documentation checks, and a
production compile.

## Documentation

- [Architecture](docs/architecture.md)
- [Walkthrough](docs/walkthrough.md)
- [Events](docs/events.md)
- [Main process](docs/main.md)
- [Preload bridge](docs/preload.md)
- [Renderer](docs/renderer.md)
- [Shared types](docs/shared.md)
- [Operations and troubleshooting](docs/operations.md)
- [Product landing page](landing.html)

## Roadmap

Open requests are tracked in [`TODO.md`](TODO.md).
