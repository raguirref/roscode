"""Synthetic IMU publisher for the demo_drift scenario.

Publishes sensor_msgs/Imu on /imu at 20 Hz.
angular_velocity.z is always 0.0 — the robot is stationary.
This proves the drift originates in the integrator, not the sensor.
"""

from __future__ import annotations

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Imu


class FakeImu(Node):
    def __init__(self) -> None:
        super().__init__('fake_imu')
        self._pub = self.create_publisher(Imu, '/imu', 10)
        self._timer = self.create_timer(0.05, self._publish)  # 20 Hz
        self.get_logger().info('fake_imu started — publishing 0.0 rad/s on /imu')

    def _publish(self) -> None:
        msg = Imu()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'imu_link'

        # Robot is stationary — no rotation
        msg.angular_velocity.x = 0.0
        msg.angular_velocity.y = 0.0
        msg.angular_velocity.z = 0.0

        # Gravity on z-axis (robot is upright)
        msg.linear_acceleration.x = 0.0
        msg.linear_acceleration.y = 0.0
        msg.linear_acceleration.z = 9.81

        # Identity orientation
        msg.orientation.w = 1.0

        self._pub.publish(msg)


def main(args=None) -> None:
    rclpy.init(args=args)
    node = FakeImu()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
