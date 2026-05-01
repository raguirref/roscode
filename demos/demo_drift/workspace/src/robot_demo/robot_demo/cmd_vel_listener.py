#!/usr/bin/env python3
"""Subscribes to /cmd_vel and logs every received Twist."""
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist


class CmdVelListener(Node):
    def __init__(self):
        super().__init__('cmd_vel_listener')
        self.sub = self.create_subscription(Twist, '/cmd_vel', self.cb, 10)
        self.get_logger().info('cmd_vel_listener up — subscribed to /cmd_vel')

    def cb(self, msg: Twist):
        self.get_logger().info(
            f'cmd_vel  lin=({msg.linear.x:+.3f}, {msg.linear.y:+.3f}, {msg.linear.z:+.3f})  '
            f'ang=({msg.angular.x:+.3f}, {msg.angular.y:+.3f}, {msg.angular.z:+.3f})'
        )


def main():
    rclpy.init()
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
