"""
imu_node — fake IMU with a small gyro bias that mimics a miscalibrated sensor.
Publishes: /imu/data (sensor_msgs/Imu)
           /imu/temp (sensor_msgs/Temperature)
"""
import math, random
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Imu, Temperature


class ImuNode(Node):
    def __init__(self):
        super().__init__('imu_node')

        self.imu_pub  = self.create_publisher(Imu,         '/imu/data', 10)
        self.temp_pub = self.create_publisher(Temperature, '/imu/temp', 10)

        # Gyro Z bias — causes slow yaw drift in odometry
        self.gz_bias  = -0.012   # rad/s  (matches robot_base drift)
        self.temp_c   = 38.0     # sensor runs warm

        self.create_timer(0.02, self._publish)   # 50 Hz
        self.get_logger().info('imu_node ready  gz_bias=%.4f rad/s' % self.gz_bias)

    def _publish(self):
        now = self.get_clock().now().to_msg()

        imu = Imu()
        imu.header.stamp    = now
        imu.header.frame_id = 'imu_link'

        # Angular velocity — Z shows the bias
        imu.angular_velocity.x = random.gauss(0.0,  0.001)
        imu.angular_velocity.y = random.gauss(0.0,  0.001)
        imu.angular_velocity.z = self.gz_bias + random.gauss(0.0, 0.002)

        # Linear acceleration — robot mostly stationary / slow
        imu.linear_acceleration.x = random.gauss(0.0, 0.02)
        imu.linear_acceleration.y = random.gauss(0.0, 0.02)
        imu.linear_acceleration.z = 9.81 + random.gauss(0.0, 0.01)

        # Covariance diagonal
        imu.angular_velocity_covariance[0]    = 0.0001
        imu.angular_velocity_covariance[4]    = 0.0001
        imu.angular_velocity_covariance[8]    = 0.0001
        imu.linear_acceleration_covariance[0] = 0.001
        imu.linear_acceleration_covariance[4] = 0.001
        imu.linear_acceleration_covariance[8] = 0.001

        self.imu_pub.publish(imu)

        temp = Temperature()
        temp.header.stamp    = now
        temp.header.frame_id = 'imu_link'
        temp.temperature     = self.temp_c + random.gauss(0.0, 0.05)
        temp.variance        = 0.01
        self.temp_pub.publish(temp)


def main():
    rclpy.init()
    rclpy.spin(ImuNode())
    rclpy.shutdown()
