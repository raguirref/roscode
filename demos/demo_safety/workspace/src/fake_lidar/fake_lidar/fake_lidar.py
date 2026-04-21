"""Synthetic LaserScan publisher for the demo_safety scenario.

Publishes sensor_msgs/LaserScan on /scan at 10 Hz.
360 rays covering a full circle.  Most rays are open (1.5 m) but
rays 0-4 (straight ahead) report an obstacle at ~0.25 m — well inside
the 0.30 m danger threshold the agent will be asked to detect.
"""

from __future__ import annotations

import math

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan


# Simulated obstacle distance — inside the 0.30 m safety threshold
_OBSTACLE_DIST = 0.25   # metres
_OPEN_DIST = 1.5        # metres (free space)
_NUM_RAYS = 360


class FakeLidar(Node):
    def __init__(self) -> None:
        super().__init__('fake_lidar')
        self._pub = self.create_publisher(LaserScan, '/scan', 10)
        self._timer = self.create_timer(0.1, self._publish)   # 10 Hz
        self.get_logger().info(
            f'fake_lidar started — {_NUM_RAYS} rays, obstacle at '
            f'{_OBSTACLE_DIST} m in rays 0-4'
        )

    def _publish(self) -> None:
        msg = LaserScan()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'base_scan'

        msg.angle_min = -math.pi
        msg.angle_max = math.pi
        msg.angle_increment = 2 * math.pi / _NUM_RAYS
        msg.time_increment = 0.0
        msg.scan_time = 0.1
        msg.range_min = 0.1
        msg.range_max = 10.0

        ranges = [_OPEN_DIST] * _NUM_RAYS
        # Inject obstacle directly ahead (rays 0-4)
        for i in range(5):
            ranges[i] = _OBSTACLE_DIST
        msg.ranges = ranges

        self._pub.publish(msg)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = FakeLidar()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
