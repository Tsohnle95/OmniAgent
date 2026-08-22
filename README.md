<div align="center">
  <img src="resources/icon.svg" width="104" alt="OmniAgent logo">
  <h1>OmniAgent</h1>
  <p>A desktop interface for working with coding agents, project files, diffs, and terminals.</p>
</div>

OmniAgent keeps the agent, repository, diffs, and terminal in one native
workspace. Ask for a change, follow the steps as they happen, inspect the files
touched, and continue working without switching between several applications.

## Features

- **See the work, not just the answer.** Streamed reasoning summaries, tool
  calls, subagents, todos, and permission requests stay visible in one timeline.
- **Review changes where they happen.** A live Changes list and Monaco-powered
  Edit/Diff views make every file modification easy to inspect.
- **Run agents side by side.** Agent Mode turns the workspace into resizable,
  concurrent session panels without hiding Sessions or your project context.
- **Keep a real development environment.** Browse files, edit with autosave,
  use Emmet, validate HTML and CSS, and open the integrated terminal.
- **Stay in control.** Choose agents and models per workspace, attach files,
  reference project context with `@`, and stop or redirect work at any time.
- **Work locally.** OmniAgent opens repositories from your machine and connects
  to your local OpenCode service.

## Workflow

The interface is deliberately direct: Sessions and files on the left, the
editor in the center, and the active agent on the right. Open the terminal when
you need it, expand Agent Mode when you want parallel work, or collapse panels
to keep the code in focus.

1. Open a repository or individual file.
2. Pick an agent and model, then describe what you want to build.
3. Watch the plan, tools, and file changes arrive live.
4. Review the diff, edit directly, validate, and continue the conversation.

## Core Capabilities

| Workspace | Agent | Review |
|---|---|---|
| File explorer and project sessions | Streaming turns and structured steps | Live Changes and per-file diffs |
| Monaco editor with tabs and autosave | Multiple models and concurrent panels | Permission requests and recovery flows |
| Integrated PTY terminal | Prompt queue, attachments, and `@` context | W3C HTML/CSS validation |

OmniAgent is an Electron, React, and Monaco application powered by
[`opencode2`](https://opencode.ai/v2). The Electron main process owns all
service and filesystem access; the renderer receives a narrow preload API and
live event stream.

## Get Started

### Requirements

- Node 22.23.2 or later within the Node 22 release line
- [`opencode2`](https://opencode.ai/v2) on your `PATH`, or an OpenCode service
  already running
- macOS for the most complete and validated experience

### Run From Source

```sh
npm install
npm run dev
```

Clone this repository, run those commands from its root, and OmniAgent will
discover the OpenCode service or start it automatically. Choose **Open a
folder** on the welcome screen to begin.

### Build And Install

```sh
npm run build          # compile and launch
npm run build:compile  # compile only
npm start              # launch the existing build
npm run pack           # package OmniAgent.app on macOS
```

On macOS, **Install app** on the welcome screen builds and installs
`OmniAgent.app` into `/Applications`.

## Platform Status

macOS is the primary development and packaging target, with `.app` builds,
Dock installation, and additional Electron and GUI smoke coverage. Linux and
Windows have automated Electron launch and real PTY coverage, but remain
development platforms while broader GUI acceptance testing is completed.

## Contributing

```sh
npm test
npm run check
```

`npm run check` runs strict TypeScript checks, the complete Vitest suite,
documentation validation, and a production compile.

Deep dives: [Architecture](docs/architecture.md) ·
[Walkthrough](docs/walkthrough.md) · [Events](docs/events.md) ·
[Main process](docs/main.md) · [Preload bridge](docs/preload.md) ·
[Renderer](docs/renderer.md) · [Shared types](docs/shared.md) ·
[Operations](docs/operations.md)
