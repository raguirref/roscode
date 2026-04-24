# roscode studio — demo script

**60-90 second video cut for the hackathon submission.** Every beat maps to one cut; timings are rough upper bounds.

---

## Setup before you hit record

```bash
# 1. Verify the fork is golden (one-liner, see verify-build.sh)
bash verify-build.sh

# 2. Make sure the ROS 2 workspace is built
source /opt/ros/humble/setup.bash
cd demos/demo_drift && ./setup.sh   # launches fake_imu + buggy odometry_node

# 3. Launch the fork
./vscodium-build/out/roscode-studio.exe
```

Keep a terminal open running `ros2 topic echo /odom` in a corner — viewers need to see the twitch drift before + after the fix.

---

## The cut

### Beat 1 · "This is roscode studio" (0:00-0:10)

- Open `roscode-studio.exe` cold. The StartB launcher paints: amber logo, `// BLUEPRINT OPS · ROS 2 IDE · POWERED BY CLAUDE`, 4 numbered action cards, recent workspaces table.
- **VO:** *"roscode studio is a standalone AI-native IDE for ROS 2 — forked from VSCodium, rebuilt around a Claude Opus 4.7 agent that actually understands your robot."*

### Beat 2 · "10 tabs, each purpose-built" (0:10-0:20)

- Click each activity bar tab in sequence — HOM → NET → GRF → NOD → TOP → PLT → LIB → TRM → AGT. Each opens instantly.
- **VO:** *"Ten tabs, each purpose-built — not VS Code repurposed. Graph, plot, network, terminal, agent — all roscode-native."*

### Beat 3 · "The plot tab shows live data" (0:20-0:30)

- Click **PLT**. Click preset `/cmd_vel · linear.x`. Canvas instantly plots — amber line on dot grid.
- **VO:** *"One click gives you live sensor plots — no rqt_plot, no X11 forwarding, no extra windows."*

### Beat 4 · "The graph tab is rqt_graph, inline" (0:30-0:40)

- Click **GRF**. Rect nodes + dashed edges render. Point out the LIVE pill and NODES/TOPICS/EDGES stats.
- **VO:** *"The graph tab replaces rqt_graph — same information, native to the IDE."*

### Beat 5 · "The agent fixes a real bug" (0:40-1:15)

- Click **AGT**. Suggestion pill `/amcl drifting?` → **instead** type your own: `the robot drifts left when rotating, check odometry_node.py and fix it`.
- Agent streams:
  - `ros_graph` tool call → finds `/imu` → `odometry_node` → `/odom`
  - `read_file odometry_node.py` → spots `self.yaw_bias = 0.05`
  - `write_file` → **Confirm/Reject card pops** → you hit **✓ Approve**
  - `colcon_build` → **Confirm card** → approve
- Terminal-in-corner: `/odom twist.angular.z` drops to 0.0.
- **VO:** *"The agent finds the bug, proposes the fix, waits for your approval on every destructive step. No auto-apply surprises."*

### Beat 6 · "It scales" (1:15-1:30)

- Cut to GitHub branches dropdown: `main` · `extension` · `tauri` · `studio`.
- **VO:** *"Four branches, four answers to the same question. The one we shipped is the fourth — but the Python brain, the extension, and the Tauri app all work, all preserved. Thank you Claude Opus 4.7."*

**Cut.**

---

## Commands you need memorized

| Moment | Command |
|---|---|
| Launch fork | `./vscodium-build/out/roscode-studio.exe` |
| Focus agent | `Ctrl+Shift+A` |
| Inline agent in editor | `Ctrl+K` |
| Open terminal | `Ctrl+\`` |
| Open node graph panel (full) | `Ctrl+Shift+G` |
| Refresh everything | click the ↻ in any tab header |

---

## Fallback plan if ROS isn't connected

Everything has demo-safe fallbacks:
- **GRF** → shows canned `robot → amcl → nav2 → controller → cmd_vel` graph with a `DEMO` pill
- **PLT** → synthetic sine + noise when no topic is live
- **NET/NOD/TOP** → mono uppercase "// AWAITING LINK" empty states

If the lab's robot goes offline mid-demo, pivot to the agent chat (uses Anthropic SDK directly, doesn't need ROS) and show it writing a new publisher node from scratch.

---

## Prize angle — Keep Thinking

The four-branch story is the pitch:

1. **main** — Day 1: "what if the agent is just a CLI?" → works, but no visual surface.
2. **extension** — Day 2: "what if it's a VS Code plugin?" → works, but we're a second-class citizen in someone else's IDE.
3. **tauri** — Day 3: "what if it's a Rust + Svelte standalone?" → works, but we're rebuilding an editor from scratch in 24 hours.
4. **studio** — Day 4: "what if we fork VSCodium like Cursor?" → this is the one. Patch the binary, bake our extension as builtin, bundle the Python as sidecar. Maximum leverage, minimum wheel-reinvention.

Keep thinking. Keep shipping the next thing.
