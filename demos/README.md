# roscode demos

Each subdirectory is a self-contained reproduction. Run the demo by:

```bash
cd demos/<demo_name>
./setup.sh                                # launches the fake sim + ROS graph
roscode "<prompt>" --workspace ./workspace  # let the agent do the rest
```

## demo_drift — fix a hidden gyro bias

A minimal ROS 2 workspace with a single `simple_odometry` package.
The odometry node integrates `/imu` into `/odom`, but
`odometry_node.py` has a hardcoded `self.yaw_bias = 0.05` applied during
integration. `setup.sh` launches the buggy node plus a fake IMU
publisher at 20 Hz.

**Prompt:** `"the robot drifts left when rotating, fix it"`

**Expected behavior:** the agent runs `ros_graph`, echoes `/odom` and
`/imu`, reads `odometry_node.py`, proposes removing the bias, asks for
confirmation, rebuilds, respawns, and re-echoes to verify the drift is
gone. See `demo_drift/expected_output.txt` for the target transcript.

## demo_safety — scaffold a new safety node

Same shape as demo_drift but no safety node exists yet — only a synthetic
lidar publisher on `/scan`.

**Prompt:** `"add a node that monitors /scan and publishes True to /obstacle_detected if anything within 30cm"`

**Expected behavior:** the agent inspects `/scan`, scaffolds a new
`safety_stop` package with `package_scaffold`, writes the node,
builds, spawns, and verifies `/obstacle_detected`.

## Status

Both demos are **scaffolded only** at this stage. The workspaces and
setup scripts are placeholders — Task 8 of the project brief fleshes
them out with real ROS 2 packages and launch files.
