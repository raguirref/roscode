"""
cmd_vel_pub — publishes a constant forward velocity command so the robot moves
and the drift becomes visible over time.
Publishes: /cmd_vel (geometry_msgs/Twist)
"""
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist


class CmdVelPublisher(Node):
    def __init__(self):
        super().__init__('cmd_vel_publisher')
        self.pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.create_timer(0.1, self._publish)   # 10 Hz
        self.get_logger().info('cmd_vel_publisher: sending vx=0.3 m/s forward')

    def _publish(self):
        msg = Twist()
        msg.linear.x  = 0.3   # 0.3 m/s forward
        msg.angular.z = 0.0   # straight line — drift will bend this
        self.pub.publish(msg)


def main():
    rclpy.init()
    rclpy.spin(CmdVelPublisher())
    rclpy.shutdown()
