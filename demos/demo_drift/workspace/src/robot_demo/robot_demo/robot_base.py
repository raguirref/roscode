#!/usr/bin/env python3
"""Simulated diff-drive base.

Publishes /odom at 20 Hz integrating commanded linear velocity from /cmd_vel,
plus a small angular drift bias of -0.012 rad/s to mimic a miscalibrated gyro
or wheel-odometry yaw drift.
"""
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry


YAW_BIAS = -0.012  # rad/s — simulated drift


class RobotBase(Node):
    def __init__(self):
        super().__init__('robot_base')

        # State
        self.x = 0.0
        self.y = 0.0
        self.yaw = 0.0
        self.cmd_v = 0.3   # default forward speed even before /cmd_vel arrives
        self.cmd_w = 0.0

        # ROS I/O
        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)
        self.cmd_sub = self.create_subscription(
            Twist, '/cmd_vel', self.on_cmd_vel, 10)

        self.dt = 1.0 / 20.0
        self.timer = self.create_timer(self.dt, self.tick)

        self.get_logger().info(
            f'robot_base up — 20 Hz, yaw_bias={YAW_BIAS:+.4f} rad/s')

    def on_cmd_vel(self, msg: Twist):
        self.cmd_v = msg.linear.x
        self.cmd_w = msg.angular.z

    def tick(self):
        # Integrate with the drift bias added to angular rate.
        w_eff = self.cmd_w + YAW_BIAS
        self.yaw += w_eff * self.dt
        # Wrap yaw to [-pi, pi]
        self.yaw = math.atan2(math.sin(self.yaw), math.cos(self.yaw))
        self.x += self.cmd_v * math.cos(self.yaw) * self.dt
        self.y += self.cmd_v * math.sin(self.yaw) * self.dt

        msg = Odometry()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'odom'
        msg.child_frame_id = 'base_link'

        msg.pose.pose.position.x = self.x
        msg.pose.pose.position.y = self.y
        msg.pose.pose.position.z = 0.0
        # yaw -> quaternion (z, w only for planar)
        msg.pose.pose.orientation.z = math.sin(self.yaw / 2.0)
        msg.pose.pose.orientation.w = math.cos(self.yaw / 2.0)

        msg.twist.twist.linear.x = self.cmd_v
        msg.twist.twist.angular.z = w_eff

        self.odom_pub.publish(msg)


def main():
    rclpy.init()
    node = RobotBase()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
