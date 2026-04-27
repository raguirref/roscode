#!/usr/bin/env python3
"""Publishes a constant forward velocity command on /cmd_vel at 10 Hz."""
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist


class CmdVelPub(Node):
    def __init__(self):
        super().__init__('cmd_vel_pub')
        self.pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.timer = self.create_timer(0.1, self.tick)
        self.get_logger().info('cmd_vel_pub up — 10 Hz, linear.x=0.3')

    def tick(self):
        msg = Twist()
        msg.linear.x = 0.3
        msg.angular.z = 0.0
        self.pub.publish(msg)


def main():
    rclpy.init()
    node = CmdVelPub()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
