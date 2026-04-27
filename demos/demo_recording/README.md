# roscode demo — differential-drive robot with drift

## What this simulates

Four nodes running simultaneously:

| Node | Topics | Description |
|------|--------|-------------|
| `robot_base` | `/odom`, `/joint_states` | Simulates a diff-drive robot with a 2 % left-wheel bias that causes slow rightward drift |
| `imu_node` | `/imu/data`, `/imu/temp` | Fake IMU at 50 Hz with a matching gyro-Z bias |
| `cmd_vel_publisher` | `/cmd_vel` | Sends 0.3 m/s forward command (straight line) — drift becomes visible |
| `diagnostics` | `/battery_state`, `/robot_status` | Battery draining from 78 %, drift warning after 30 s |

## Setup in roscode

1. Open roscode studio
2. **Settings → Workspace** → point to this folder:
   `demos/demo_recording/workspace`
3. Click **Start Runtime** — Lima VM + ROS 2 container boots
4. In the terminal, build the package:
   ```bash
   cd /workspace && colcon build --packages-select robot_demo
   source install/setup.bash
   ```
5. Launch the demo:
   ```bash
   ros2 launch robot_demo demo.launch.py
   ```
6. Topics panel and Node graph will populate automatically.

## Demo flow for recording

1. Show **Topics** tab — 7 live topics appear
2. Show **Nodes** tab — node graph with connections
3. Ask the agent: *"why is the robot drifting right?"*
4. Agent inspects `/imu/data` (gz_bias), `/odom` (lateral drift), finds the bias
5. Agent patches `robot_base.py` to zero the `drift_bias`
6. Rebuild: the drift disappears in `/odom`
