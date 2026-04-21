#!/usr/bin/env bash
# demo_safety — launch a fake LaserScan publisher on /scan, no safety node yet.
#
# PLACEHOLDER: this is the Task 8 scaffold. The real implementation will:
#   1. colcon build --packages-select fake_lidar
#   2. ros2 run fake_lidar fake_lidar &   # 10 Hz synthetic LaserScan
#
# The agent is expected to scaffold the safety_stop package itself.

set -euo pipefail

echo "[demo_safety] PLACEHOLDER — ROS 2 workspace not yet populated."
echo "[demo_safety] Will eventually:"
echo "  - source /opt/ros/humble/setup.bash"
echo "  - colcon build --packages-select fake_lidar"
echo "  - source install/setup.bash"
echo "  - ros2 run fake_lidar fake_lidar &"
echo ""
echo "[demo_safety] Then run: roscode \"add a node that monitors /scan and publishes \\"
echo "                         True to /obstacle_detected if anything within 30cm\" \\"
echo "                         --workspace ./workspace"
exit 0
