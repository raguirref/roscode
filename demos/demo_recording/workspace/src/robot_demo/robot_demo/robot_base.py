"""
robot_base — simulates a differential-drive robot with a left-wheel bias (drift).
Publishes:  /odom  (nav_msgs/Odometry)
            /joint_states (sensor_msgs/JointState)
Subscribes: /cmd_vel (geometry_msgs/Twist)
"""
import math, time
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
from geometry_msgs.msg import Quaternion, TransformStamped
from sensor_msgs.msg import JointState
from std_msgs.msg import Header


def yaw_to_quat(yaw: float) -> Quaternion:
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


class RobotBase(Node):
    def __init__(self):
        super().__init__('robot_base')

        # State
        self.x = 0.0
        self.y = 0.0
        self.yaw = 0.0
        self.vx = 0.0
        self.wz = 0.0

        # Drift bias — left wheel spins ~2 % slower, causes slow right curve
        self.drift_bias = -0.012   # rad/s added to angular velocity

        self.odom_pub  = self.create_publisher(Odometry,   '/odom',         10)
        self.joint_pub = self.create_publisher(JointState, '/joint_states',  10)

        self.cmd_sub = self.create_subscription(
            __import__('geometry_msgs.msg', fromlist=['Twist']).Twist,
            '/cmd_vel', self._cmd_cb, 10)

        self.dt = 0.05
        self.create_timer(self.dt, self._update)
        self.get_logger().info('robot_base ready (drift_bias=%.3f rad/s)' % self.drift_bias)

    def _cmd_cb(self, msg):
        self.vx = msg.linear.x
        self.wz = msg.angular.z

    def _update(self):
        wz_actual = self.wz + self.drift_bias
        self.yaw += wz_actual * self.dt
        self.x   += self.vx * math.cos(self.yaw) * self.dt
        self.y   += self.vx * math.sin(self.yaw) * self.dt

        now = self.get_clock().now().to_msg()

        # Odometry
        odom = Odometry()
        odom.header.stamp    = now
        odom.header.frame_id = 'odom'
        odom.child_frame_id  = 'base_link'
        odom.pose.pose.position.x = self.x
        odom.pose.pose.position.y = self.y
        odom.pose.pose.orientation = yaw_to_quat(self.yaw)
        odom.twist.twist.linear.x  = self.vx
        odom.twist.twist.angular.z = wz_actual
        self.odom_pub.publish(odom)

        # Joint states (two wheels)
        js = JointState()
        js.header.stamp = now
        js.name     = ['left_wheel_joint', 'right_wheel_joint']
        js.velocity = [self.vx / 0.1 * (1 - 0.02), self.vx / 0.1]
        js.position = [0.0, 0.0]
        self.joint_pub.publish(js)


def main():
    rclpy.init()
    rclpy.spin(RobotBase())
    rclpy.shutdown()
