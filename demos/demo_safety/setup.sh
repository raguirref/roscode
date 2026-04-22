#!/usr/bin/env bash
# demo_safety — build and launch the fake_lidar workspace.
#
# Run this inside the devcontainer (ROS 2 Humble must be sourced).
# In a second terminal, run the agent:
#   roscode "add a node that monitors /scan and publishes True to
#            /obstacle_detected if anything is within 30 cm" \
#           --workspace "$(dirname "$0")/workspace"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$SCRIPT_DIR/workspace"

echo "[demo_safety] Sourcing ROS 2 Humble..."
# shellcheck disable=SC1091
source /opt/ros/humble/setup.bash

echo "[demo_safety] Building fake_lidar..."
cd "$WS"
colcon build --packages-select fake_lidar --symlink-install

echo "[demo_safety] Sourcing install space..."
# shellcheck disable=SC1091
source "$WS/install/setup.bash"

echo "[demo_safety] Launching fake_lidar..."
ros2 run fake_lidar fake_lidar &
LIDAR_PID=$!

echo ""
echo "  fake_lidar  pid=$LIDAR_PID  (publishes /scan at 10 Hz)"
echo "  Rays 0-4 report an obstacle at 0.25 m — inside the 0.30 m threshold."
echo "  No safety_stop node exists yet. The agent will create it."
echo ""
echo "Now open a second terminal (in the same container) and run:"
echo ""
echo "  roscode \"add a node that monitors /scan and publishes True to \\"
echo "           /obstacle_detected if anything is within 30 cm\" \\"
echo "          --workspace $WS"
echo ""
echo "Press Ctrl+C here to stop all nodes."

trap "kill $LIDAR_PID 2>/dev/null; echo '[demo_safety] Stopped.'; exit 0" INT TERM
wait
