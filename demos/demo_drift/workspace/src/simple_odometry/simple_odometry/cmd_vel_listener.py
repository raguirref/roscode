"""Subscriber node for /cmd_vel.

Listens to geometry_msgs/Twist messages on /cmd_vel and logs the
linear and angular velocity components. Useful as a sanity check
that a teleop / planner upstream is actually publishing commands.
"""

from __future__ import annotations

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist


class CmdVelListener(Node):
    def __init__(self) -> None:
        super().__init__('cmd_vel_listener')
        self._sub = self.create_subscription(
            Twist,
            '/cmd_vel',
            self._on_cmd_vel,
            10,
        )
        self.get_logger().info('cmd_vel_listener started — subscribed to /cmd_vel')

    def _on_cmd_vel(self, msg: Twist) -> None:
        self.get_logger().info(
            f'cmd_vel  linear=({msg.linear.x:+.3f}, {msg.linear.y:+.3f}, {msg.linear.z:+.3f}) m/s  '
            f'angular=({msg.angular.x:+.3f}, {msg.angular.y:+.3f}, {msg.angular.z:+.3f}) rad/s'
        )


def main(args=None) -> None:
    rclpy.init(args=args)
    node = CmdVelListener()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
