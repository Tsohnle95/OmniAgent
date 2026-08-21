# OpenShell

**A calm, visual workspace for coding with OpenCode.**

OpenShell is a desktop app that puts your repository, editor, terminal, and AI
agent in one place. Open a project, describe what you want to change, and
watch the agent explore the code, explain its work, and make live edits you can
review before you keep them.

It is built for people who want the speed of an AI coding agent without giving
up visibility or control.

![OpenShell workspace showing the file explorer, editor, live changes, and agent timeline](docs/screenshots/workspace.png)

## What OpenShell Does

- **Works inside your real project** — open a repository or an individual file
  and work against the files on disk.
- **Shows the agent working in real time** — follow streamed answers, reasoning,
  file exploration, shell commands, subagents, todos, permissions, and model
  activity in one readable timeline.
- **Makes changes easy to understand** — see observed file changes in the
  Changes list and switch any known change between editing and a focused diff.
- **Keeps you in the loop** — approve or reject permission requests, interrupt
  a run, edit files yourself, or continue the conversation with a follow-up.
- **Feels like a familiar development environment** — a file explorer, Monaco
  editor, tabs, autosave, integrated terminal, drag-and-drop files, and common
  editor conveniences such as Emmet and word wrap.
- **Keeps work organized** — reopen recent sessions, switch between saved
  workspaces, and run concurrent model panels when you want multiple lines of
  investigation.
- **Helps with front-end files** — HTML and CSS files can be checked with the
  W3C validators, with results shown directly as editor markers.
- **Stays local** — OpenShell is an Electron desktop client. Your project is
  opened from your machine and the app talks to the local OpenCode service.

## How It Works

1. Open a folder from the Welcome screen, or open a single file.
2. Choose an agent and model, then describe the task in the prompt box. You can
   attach files or reference workspace files with `@`.
3. Watch the agent inspect the project and stream its progress on the right.
4. Review the files it changed from the explorer or Changes list. Use **Diff**
   to see what moved and **Edit** to continue working directly in the file.
5. Ask for another change, run a command in the integrated terminal, or stop
   the session when you have what you need.

## Getting Started

### Requirements

- macOS, Linux, or Windows
- Node 22.23.2 or later within the Node 22 release line
- [`opencode2`](https://opencode.ai/v2) on your `PATH`, or an OpenCode service
  already running

### Install And Run From Source

```sh
git clone https://github.com/Tsohnle95/OpenShell.git
cd OpenShell
npm install
npm run dev
```

OpenShell will discover the OpenCode service and start it automatically when
needed. Once the app opens, select **Open a folder** and start a session.

### Install As A macOS App

For a normal Dock/Finder application:

```sh
npm install
npm run pack
```

Or run the development build and choose **Install app** on the Welcome screen.
The packaged app is written to `release/mac/OpenShell.app`; the Welcome button
installs `OpenShell.app` into `/Applications`.

## Why OpenShell

Most agent interfaces make you choose between a chat window and a development
environment. OpenShell combines both. The conversation tells you what the
agent is doing, the editor shows the actual project, and the live Changes view
keeps the result inspectable. You can let the agent move quickly while still
seeing, approving, editing, and validating the work as it happens.

## Development

```sh
npm install
npm run dev          # Electron + React development mode
npm test             # unit and component tests
npm run check        # typecheck, tests, docs check, and production compile
npm run build        # compile and launch the production app
```

OpenShell is an Electron + React + Monaco client. The Electron main process is
the only process that talks to OpenCode; the renderer receives streamed events
and file updates over the preload bridge. See the [architecture guide](docs/architecture.md)
for the implementation overview and [operations guide](docs/operations.md)
for troubleshooting.

## Documentation

- [Architecture](docs/architecture.md) — process model, IPC, streaming, and diffs
- [Walkthrough](docs/walkthrough.md) — the main user and data flows
- [Events](docs/events.md) — OpenCode event handling
- [Renderer guide](docs/renderer.md) — UI state and components
- [Main process guide](docs/main.md) — backend and filesystem behavior
- [Preload and shared types](docs/preload.md) — bridge and contracts
- [Landing page](landing.html) — the self-contained product overview

## Roadmap

Open requests and working items are tracked in [`TODO.md`](TODO.md). The goal
is to keep OpenShell a focused, transparent, and dependable desktop home for
agent-assisted software work.

## License

OpenShell is currently private software under active development.
