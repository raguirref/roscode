# roscode studio — Claude Code context

Context file for Claude Code. Work through the phases in order. Do not skip ahead unless I explicitly say so. Before each phase ask "proceed with Phase N?" and wait for confirmation.

---

## 1. What this is

`roscode studio` is a ROS 2 IDE with its own identity. It ships in **two complementary forms**:

- **VS Code Extension** (`roscode-extension/`) — installs into VSCodium (or VS Code), adds a custom activity-bar sidebar with agent chat, ROS graph, topic monitor, network discovery, and package library. Ships as a `.vsix`.
- **Tauri App** (`studio/`) — standalone desktop app (macOS/Windows/Linux). Svelte + Rust. Includes Monaco editor, Cytoscape ROS graph, xterm.js terminal, and the same Python agent over WebSocket.

The Python agent from the existing `roscode` CLI (15 tools, confirmation gate) is reused as the brain for both forms.

**Deadline: Sunday April 27 2026, 8:00 PM EST (hackathon).**

---

## 2. Branch strategy

One repo: `roscode`.

- `main` — existing CLI (hackathon project). Untouched.
- `studio` — this IDE project. Created fresh off main.

The Python agent lives in `roscode/` (repo root of the studio branch). It is **not** copied to `agent/` — the original structure is preserved directly.

---

## 3. Actual repo structure (studio branch — current state)

```
roscode/                               # repo root on `studio` branch
├── CLAUDE.md                          # this file
├── README.md
├── pyproject.toml                     # Python package config (hatch)
├── requirements.txt
├── .devcontainer/devcontainer.json    # ROS 2 Humble + Python 3.11
├── .env.example
│
├── roscode/                           # Python agent (brain of both IDE forms)
│   ├── __init__.py                    # version 0.1.0
│   ├── agent.py                       # agentic loop, max 20 iterations, DESTRUCTIVE gate
│   ├── cli.py                         # Click entry point (--workspace, --model, --no-confirm, -i)
│   ├── config.py                      # Pydantic settings (ANTHROPIC_API_KEY, ROSCODE_MODEL, etc.)
│   ├── container.py                   # Docker/Podman transparent backend for ROS 2
│   ├── prompts.py                     # system prompt (~191 lines, PID tuning methodology)
│   ├── server.py                      # WebSocket server (port 9000) for Tauri webview
│   ├── ui.py                          # Rich terminal renderer (TerminalSink + NullSink)
│   ├── ui_protocol.py                 # Abstract UiSink protocol
│   └── tools/
│       ├── __init__.py                # TOOL_DEFINITIONS + TOOL_MAP exports
│       ├── _state.py                  # thread-safe workspace path singleton
│       ├── _shell.py                  # subprocess wrapper (container-transparent)
│       ├── fs_tools.py                # read_source_file, list_workspace
│       ├── ros_tools.py               # ros_graph, topic_echo, topic_hz, log_tail,
│       │                              #   service_call, param_get, param_set, tf_lookup
│       ├── build_tools.py             # write_source_file, workspace_build,
│       │                              #   node_spawn, node_kill, package_scaffold
│       └── runtime_tools.py           # topic_publish, robot_estop, topic_sample,
│                                      #   analyze_signal, identify_fopdt, relay_autotune,
│                                      #   ziegler_nichols/tyreus_luyben/cohen_coon/
│                                      #   skogestad_simc/chien_hrones_reswick _gains,
│                                      #   step_response_metrics, safety_envelope
│
├── tests/                             # 56 passing unit tests (mocked shell)
│   ├── conftest.py                    # FakeShell fixture, ROSCODE_NO_CONTAINER=1
│   ├── test_fs_tools.py
│   ├── test_build_tools.py
│   ├── test_ros_tools.py
│   └── test_tools.py
│
├── demos/
│   ├── README.md
│   ├── demo_drift/                    # Fix yaw_bias bug in simple_odometry
│   │   ├── setup.sh
│   │   ├── expected_output.txt
│   │   └── workspace/src/simple_odometry/
│   └── demo_safety/                   # Scaffold obstacle-detection safety node
│       ├── setup.sh
│       └── workspace/src/fake_lidar/
│
├── packages/
│   └── registry.json                  # 15-20 curated ROS 2 packages (JSON)
│
├── roscode-extension/                 # VS Code / VSCodium extension — PRIMARY IDE FORM
│   ├── package.json                   # publisher: "roscode", name: "roscode"
│   ├── tsconfig.json
│   ├── esbuild.js                     # bundler config
│   ├── pnpm-lock.yaml
│   ├── roscode-0.1.0.vsix             # built VSIX, ready to install
│   ├── themes/                        # color themes
│   ├── media/                         # icons + assets
│   ├── webviews/                      # compiled webview JS (agent/, graph/, monitor/)
│   └── src/
│       ├── extension.ts               # activate(): registers all views, providers, commands
│       ├── branding/
│       │   └── workbenchBrand.ts      # CSS injection into workbench.html (accent, fonts)
│       ├── providers/
│       │   ├── NetworkProvider.ts     # TreeView: discovered robots on LAN
│       │   ├── TopicProvider.ts       # TreeView: active ROS topics
│       │   ├── NodeProvider.ts        # TreeView: running ROS nodes
│       │   └── LibraryProvider.ts     # TreeView: package library from registry.json
│       ├── views/
│       │   ├── HomeView.ts            # WebviewView: home/launcher panel
│       │   └── AgentView.ts           # WebviewView: agent chat (Anthropic SDK, streaming)
│       ├── panels/
│       │   ├── NodeGraphPanel.ts      # WebviewPanel: ROS node graph
│       │   └── TopicMonitorPanel.ts   # WebviewPanel: topic echo monitor
│       ├── ros/
│       │   └── connection.ts          # RosConnection class (ROS1 + ROS2, LAN scan)
│       └── agent/
│           ├── tools.ts               # 8 agent tools: list_topics, echo_topic, list_nodes,
│           │                          #   read_file, write_file, shell, colcon_build, get_node_graph
│           └── inlineAsk.ts           # roscode.inlineAsk command (inline editor AI)
│
├── studio/                            # Tauri standalone app — SECONDARY IDE FORM
│   ├── package.json                   # name: roscode-studio, deps: monaco, cytoscape, xterm
│   ├── vite.config.ts
│   ├── svelte.config.js
│   ├── tsconfig.json
│   ├── pnpm-lock.yaml
│   ├── index.html
│   ├── src/                           # Svelte frontend
│   │   ├── App.svelte
│   │   ├── app.css
│   │   ├── main.ts
│   │   └── lib/
│   │       ├── Chat.svelte            # agent chat (WebSocket to roscode/server.py)
│   │       ├── Terminal.svelte        # xterm.js terminal
│   │       ├── RosMap.svelte          # Cytoscape ROS graph
│   │       ├── PackageStore.svelte    # package library UI
│   │       ├── Splash.svelte          # splash / launcher screen
│   │       ├── chat.ts                # AgentClient (WebSocket protocol)
│   │       ├── editor/                # Monaco editor wrapper
│   │       ├── layout/                # resizable panel layout
│   │       └── stores/                # Svelte stores
│   └── src-tauri/                     # Rust backend
│       └── src/
│           ├── main.rs
│           ├── lib.rs
│           ├── commands.rs            # Tauri commands exposed to frontend
│           ├── container.rs           # Docker/Podman container management
│           └── lima.rs                # Lima VM support (macOS)
│
├── roscode-studio-build/              # Built macOS artifacts
│   ├── roscode studio.app             # installable macOS app (built from Tauri)
│   ├── roscode-studio.icns            # app icon
│   └── roscode-studio.iconset/        # icon set (all sizes)
│
└── vscodium-build/
    └── VSCodium.zip                   # VSCodium binary (downloaded, not yet patched)
```

---

## 4. Stack decisions (locked)

| Layer | Choice |
|---|---|
| **Extension language** | TypeScript (esbuild, not Webpack) |
| **Extension webviews** | Vanilla JS/HTML (no framework — keeps CSP simple) |
| **Tauri frontend** | Svelte 4 + TypeScript + Vite |
| **Tauri backend** | Rust (Tauri v1) |
| **ROS graph** | Cytoscape.js |
| **Terminal** | xterm.js (@xterm/xterm + @xterm/addon-fit) |
| **Code editor** | Monaco Editor |
| **Agent API (extension)** | Anthropic TypeScript SDK directly in extension host |
| **Agent API (Tauri)** | Python WebSocket server (`roscode/server.py`) on ws://localhost:9000 |
| **Accent color** | `#4cc9f0` (cyan) |
| **Dark only** | yes, no light mode |

**Extension agent tools (8 in `agent/tools.ts`):**
`list_topics`, `echo_topic`, `list_nodes`, `read_file`, `write_file`, `shell`, `colcon_build`, `get_node_graph`

**Python agent tools (15+ in `roscode/tools/`):**
`read_source_file`, `list_workspace`, `ros_graph`, `topic_echo`, `topic_hz`, `log_tail`, `service_call`, `param_get`, `param_set`, `tf_lookup`, `write_source_file`, `workspace_build`, `node_spawn`, `node_kill`, `package_scaffold`, `topic_publish`, `robot_estop`, `topic_sample`, `analyze_signal`, `identify_fopdt`, `relay_autotune`, PID gain calculators, `step_response_metrics`, `safety_envelope`

---

## 5. MVP scope — what must work to ship

1. **Extension installs** — `roscode-0.1.0.vsix` installs into VSCodium (or VS Code) without errors.
2. **Sidebar** — custom roscode activity-bar icon opens the sidebar with all four tree views: Network, Topics, Nodes, Library.
3. **Network discovery** — discovers robots on LAN; connect/disconnect commands work.
4. **Agent chat** — user sends a message → Claude responds streaming → tool calls render with confirm/reject for destructive ops. Safety gate preserved.
5. **Node graph** — `roscode.openNodeGraph` opens a panel showing the ROS graph.
6. **Topic monitor** — `roscode.openTopicMonitor` opens a panel echoing topic messages.
7. **Package library** — Library tree view shows registry.json packages with category filters.
8. **Branding** — workbench accent is cyan, sidebar label says "roscode studio".
9. **Tauri app opens** — `roscode studio.app` launches, shows splash, connects to Python agent, chat works.
10. **Demos ready** — demo_drift and demo_safety are fully populated and runnable cold.

---

## 6. Phases and current status

### Phase 0 — Branch bootstrap ✅ DONE
Studio branch created. Python agent preserved in `roscode/`. Folder skeleton established.

### Phase 1 — VSCodium fork + rebrand 🔶 PARTIAL
VSCodium.zip downloaded to `vscodium-build/`. The `.vsix` installs into VSCodium natively — no fork patches needed for MVP. Branding handled via CSS injection in `workbenchBrand.ts`. Deep fork patches (hide activity bar for non-roscode projects, custom title bar) are post-MVP.

**To complete if time allows:**
- Apply `product.json` rebrand (nameShort: "roscode", etc.) to the VSCodium binary.
- Write `setup.sh` that automates patching + building.

### Phase 2 — Extension scaffold + build pipeline ✅ DONE
`roscode-extension/` is fully scaffolded with esbuild, all providers/views/panels, and a built `.vsix`.

**Build:** `cd roscode-extension && pnpm install && pnpm run package`
**Install:** `code --install-extension roscode-0.1.0.vsix`

### Phase 3 — Home / Launcher webview ✅ DONE
`HomeView.ts` registers as `roscode.home` webview view. Shows connection status, robot count, quick-action buttons. Activated on startup (`onStartupFinished`).

### Phase 4 — Studio webview (4 quadrants) ✅ DONE (Tauri form)
Tauri app has the 4-quadrant layout: Chat (top-right), Terminal (bottom-right), RosMap (bottom-left), PackageStore (top-left). Layout is resizable via `studio/src/lib/layout/`.

In the extension form the quadrants map to: AgentView (sidebar), NodeGraphPanel, TopicMonitorPanel, LibraryProvider tree view.

### Phase 5 — New Project Wizard ❌ NOT STARTED
No wizard exists yet. Templates are not created.

**To implement:**
- Modal in HomeView: name input → robot type picker (diff-drive / ackermann / manipulator / empty) → confirm → scaffold.
- `scaffoldProject.ts` creates the colcon workspace with `.roscode/config.json` and template source.
- Templates: `package.xml`, `CMakeLists.txt`, hello-world node, `launch/` folder.
- Fully flesh out **diff-drive** and **empty** templates. Ackermann/manipulator can be placeholders.
- After scaffold: `vscode.openFolder()` → extension activates on `workspaceContains:.roscode/`.

### Phase 6 — Package Library ✅ DONE
`packages/registry.json` has 15-20 curated packages. `LibraryProvider.ts` renders them as a tree view with category grouping.

**Remaining:** AI search button — calls Anthropic API (`claude-sonnet-4-20250514`, max 1024 tokens) with user query, returns 3-5 GitHub repo suggestions as JSON. API key from `ANTHROPIC_API_KEY` env; show setup hint if missing.

### Phase 7 — Agent Chat wiring ✅ DONE
`AgentView.ts` uses the Anthropic TypeScript SDK directly (no Python subprocess). Streams tokens, renders tool-call cards with Confirm/Reject. Confirmation gate preserved for destructive tools (`write_file`, `shell`, `colcon_build`).

**Known gap:** Extension agent has 8 tools vs Python agent's 15+. To close the gap: add `param_get`, `param_set`, `topic_hz`, `service_call`, `package_scaffold` to `agent/tools.ts`.

### Phase 8 — Runtime (Docker / Lima) 🔶 PARTIAL
- `ros/connection.ts` handles ROS1 + ROS2 connection, LAN network scanning.
- Tauri Rust backend has `container.rs` and `lima.rs` for Docker/Podman/Lima VM.
- Status pill in Tauri top bar reflects connection state.

**Remaining for extension:** Wire a "Start ROS Runtime" command → `docker compose up -d` from workspace `runtime/` → flip status pill from offline to online. Full graph/terminal streaming is post-MVP.

### Phase 9 — post-MVP (enumerate only, do not execute)
- Live ROS graph: rosbridge WebSocket → Cytoscape live updates.
- Real terminal: `node-pty` in extension host → xterm.js in webview.
- Real package install: clone script per package, run in runtime container.
- VSCodium deep fork: hide activity bar for non-roscode workspaces, custom title bar.
- Phase 5 enrichment: AI-generated scaffolding instead of static templates.
- Extension agent tool parity: grow to 15 tools matching Python agent.

---

## 7. Key invariants — never break these

- **DESTRUCTIVE_TOOLS gate** — `write_source_file` / `write_file` / `workspace_build` / `colcon_build` / `shell` / `node_spawn` / `node_kill` / `param_set` / `package_scaffold` / `topic_publish` / `relay_autotune` always require human confirmation before execution.
- **`robot_estop` is never gated** — must be callable autonomously at any time as a failsafe.
- **Never modify `roscode/` tools without running tests** — `pytest tests/` must stay green (56 tests).
- **All Python tool results return `str`** — no dicts, no bytes, no raw subprocess output.
- **Safety caps in `runtime_tools.py`** — `SAFETY_CAPS` (linear 0.3 m/s, angular 0.5 rad/s) are programmatic; cannot be bypassed by prompting.
- **No API keys in source** — `ANTHROPIC_API_KEY` always from env. Show a setup hint if missing, never crash.
- **Webview CSP** — use `webview.asWebviewUri` for all local resources. Anthropic API calls go through the extension host, never the webview directly.

---

## 8. Developer workflow

### Python agent CLI
```bash
pip install -e .
roscode "describe the ROS graph" --workspace ~/ros2_ws
```

### Python agent WebSocket server (for Tauri)
```bash
python -m roscode.server   # starts on ws://localhost:9000
```

### Build + install VS Code extension
```bash
cd roscode-extension
pnpm install
pnpm run package           # outputs roscode-0.1.0.vsix
code --install-extension roscode-0.1.0.vsix
```

### Tauri app dev mode
```bash
cd studio
pnpm install
pnpm tauri dev             # requires Rust + Tauri CLI
```

### Run tests
```bash
pytest tests/              # 56 tests, all mocked, no ROS required
```

### Run demos (requires devcontainer or ROS 2 Humble on PATH)
```bash
cd demos/demo_drift && ./setup.sh
roscode "the robot drifts left when rotating, fix it"

cd demos/demo_safety && ./setup.sh
roscode "add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm"
```

---

## 9. Extension commands reference

| Command | ID | Description |
|---|---|---|
| Open Agent | `roscode.openAgent` | Focus the agent chat view |
| Open Node Graph | `roscode.openNodeGraph` | Open node graph panel |
| Open Topic Monitor | `roscode.openTopicMonitor` | Open topic monitor panel |
| Discover Network | `roscode.discoverNetwork` | Scan LAN for robots |
| Connect Robot | `roscode.connectRobot` | Connect to a discovered robot |
| Disconnect Robot | `roscode.disconnectRobot` | Disconnect |
| Refresh Nodes | `roscode.refreshNodes` | Refresh node tree view |
| Echo Topic | `roscode.echoTopic` | Echo a topic in the monitor |
| Inline Ask | `roscode.inlineAsk` | AI assist inline in editor |
| Search Library | `roscode.searchLibrary` | Filter package library |
| Insert Message Type | `roscode.insertMessageType` | Insert ROS msg type at cursor |

---

## 10. Known issues / watch out for

- **`colcon build` slow (60s+)** — never set build timeout under 120s.
- **`ros2 topic echo` blocks** — always wrap subprocess calls in `timeout`.
- **Mac M-series** — ROS 2 must run inside Docker or Lima VM; `rclpy` won't work natively.
- **Webview CSP errors** — if a webview goes blank, check DevTools console for CSP violations. All assets must use `webview.asWebviewUri`.
- **esbuild vs tsc** — extension uses esbuild for bundling (`esbuild.js`). `tsc` does type-check only. Always use `pnpm run package` to build.
- **pnpm workspaces** — `roscode-extension/` and `studio/` each have their own `pnpm-lock.yaml`. Run `pnpm install` inside each directory separately.
- **Python path for server.py** — Tauri app expects `python roscode/server.py` to be resolvable. In packaged form the Python env must be bundled or on user PATH.
- **`.vsix` rebuild after src changes** — `roscode-0.1.0.vsix` is committed for convenience but must be rebuilt after every meaningful change: `pnpm run package`.

---

## 11. Execution order for next session (tight path)

1. **Smoke-test .vsix install** — install into VSCodium, verify all views load, agent chat works, no console errors. (15 min)
2. **Phase 5 — New Project Wizard** — modal in HomeView, diff-drive + empty templates only, opens folder after scaffold. (1.5 hr)
3. **Phase 6 remaining — AI Library Search** — `✨ AI search` button, calls Anthropic API, shows GitHub suggestions. (45 min)
4. **Demo polish** — fully populate `demos/demo_drift/` and `demos/demo_safety/`, verify cold-run. (1 hr)
5. **Extension agent tool parity** — add `param_get`, `param_set`, `topic_hz`, `service_call`, `package_scaffold` to extension `agent/tools.ts`. (1 hr)
6. **Phase 8 remaining — Runtime start button** — "Start ROS" command → docker compose → status pill flips. (45 min)
7. **README + demo GIFs** — screen recording of both demos, embed in README. (1 hr)
8. **Phase 1 VSCodium rebrand** — only if time remains. (2 hr)

---

## 12. Checkpoints

After each phase, tell me:

- What you built.
- What you skipped and why.
- Anything you had to decide on your own.
- One screenshot or description of how it looks.

Then ask before moving to the next phase.
