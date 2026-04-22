#!/usr/bin/env bash
# demo_drift — build and launch the simple_odometry workspace.
#
# Run this inside the devcontainer (ROS 2 Humble must be sourced).
# In a second terminal, run the agent:
#   roscode "the robot drifts left when rotating, fix it" \
#           --workspace "$(dirname "$0")/workspace"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$SCRIPT_DIR/workspace"

echo "[demo_drift] Sourcing ROS 2 Humble..."
# shellcheck disable=SC1091
source /opt/ros/humble/setup.bash

echo "[demo_drift] Building simple_odometry..."
cd "$WS"
colcon build --packages-select simple_odometry --symlink-install

echo "[demo_drift] Sourcing install space..."
# shellcheck disable=SC1091
source "$WS/install/setup.bash"

echo "[demo_drift] Launching nodes..."
ros2 run simple_odometry fake_imu &
IMU_PID=$!
sleep 0.5
ros2 run simple_odometry odometry_node &
ODOM_PID=$!

echo ""
echo "  fake_imu       pid=$IMU_PID   (publishes /imu  at 20 Hz, angular_velocity.z = 0)"
echo "  odometry_node  pid=$ODOM_PID  (publishes /odom at 20 Hz, has yaw_bias bug)"
echo ""
echo "Now open a second terminal (in the same container) and run:"
echo ""
echo "  roscode \"the robot drifts left when rotating, fix it\" \\"
echo "          --workspace $WS"
echo ""
echo "Press Ctrl+C here to stop all nodes."

trap "kill $IMU_PID $ODOM_PID 2>/dev/null; echo '[demo_drift] Stopped.'; exit 0" INT TERM
wait
