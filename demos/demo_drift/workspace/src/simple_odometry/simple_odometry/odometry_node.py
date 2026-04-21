"""Yaw-integrating odometry node for the demo_drift scenario.

Subscribes to /imu (sensor_msgs/Imu) and publishes /odom (nav_msgs/Odometry).
Integrates angular_velocity.z over time to track heading.

BUG: self.yaw_bias is hardcoded to 0.05 instead of 0.0.
     This adds 0.05 rad/s of spurious rotation to every integration step,
     causing the robot to report a slow left-hand drift even when stationary.
"""

from __future__ import annotations

import math

import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
from sensor_msgs.msg import Imu


class OdometryNode(Node):
    def __init__(self) -> None:
        super().__init__('odometry_node')

        # Hardcoded bias — should be 0.0.  This is the bug to find and fix.
        self.yaw_bias = 0.05  # rad/s

        self._yaw: float = 0.0
        self._last_t: float | None = None

        self._sub = self.create_subscription(Imu, '/imu', self._imu_cb, 10)
        self._pub = self.create_publisher(Odometry, '/odom', 10)
        self.get_logger().info(
            f'odometry_node started (yaw_bias={self.yaw_bias} rad/s)'
        )

    def _imu_cb(self, msg: Imu) -> None:
        now = self.get_clock().now().nanoseconds * 1e-9

        if self._last_t is None:
            self._last_t = now
            return

        dt = now - self._last_t
        self._last_t = now

        # Integrate heading — yaw_bias causes drift when robot is stationary
        self._yaw += (msg.angular_velocity.z + self.yaw_bias) * dt

        odom = Odometry()
        odom.header.stamp = msg.header.stamp
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_link'

        # Quaternion from yaw (roll=0, pitch=0)
        odom.pose.pose.orientation.z = math.sin(self._yaw / 2.0)
        odom.pose.pose.orientation.w = math.cos(self._yaw / 2.0)

        # Expose accumulated yaw in twist.angular.z for easy inspection
        odom.twist.twist.angular.z = self._yaw

        self._pub.publish(odom)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = OdometryNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
