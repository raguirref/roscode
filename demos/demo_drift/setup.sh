#!/usr/bin/env bash
# demo_drift — launch the buggy simple_odometry node + a fake IMU publisher.
#
# PLACEHOLDER: this is the Task 8 scaffold. The real implementation will:
#   1. colcon build --packages-select simple_odometry
#   2. ros2 run simple_odometry fake_imu &         # 20 Hz synthetic IMU
#   3. ros2 run simple_odometry odometry_node &    # buggy integrator
#   4. print the PIDs + a test script that rotates the sim 360°
#
# Until Task 8 is implemented this script just tells you what will happen.

set -euo pipefail

echo "[demo_drift] PLACEHOLDER — ROS 2 workspace not yet populated."
echo "[demo_drift] Will eventually:"
echo "  - source /opt/ros/humble/setup.bash"
echo "  - colcon build --packages-select simple_odometry"
echo "  - source install/setup.bash"
echo "  - ros2 run simple_odometry fake_imu &"
echo "  - ros2 run simple_odometry odometry_node &"
echo ""
echo "[demo_drift] Then run: roscode \"the robot drifts left when rotating, fix it\" \\"
echo "                        --workspace ./workspace"
exit 0
