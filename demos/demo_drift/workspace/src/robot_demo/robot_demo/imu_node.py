#!/usr/bin/env python3
"""Simulated IMU.

Publishes /imu/data (sensor_msgs/Imu) at 50 Hz with gaussian noise and a
gyro Z bias of -0.012 rad/s, plus /imu/temp (sensor_msgs/Temperature) at
the same rate so downstream nodes can compensate for thermal drift.
"""
import random

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Imu, Temperature


GYRO_Z_BIAS = -0.012     # rad/s
GYRO_NOISE_STD = 0.005   # rad/s
ACCEL_NOISE_STD = 0.02   # m/s^2


class ImuNode(Node):
    def __init__(self):
        super().__init__('imu_node')

        self.imu_pub = self.create_publisher(Imu, '/imu/data', 50)
        self.temp_pub = self.create_publisher(Temperature, '/imu/temp', 10)

        self.timer = self.create_timer(1.0 / 50.0, self.tick)
        self.t = 0.0
        self.temp_c = 30.0

        self.get_logger().info(
            f'imu_node up — 50 Hz, gyro_z_bias={GYRO_Z_BIAS:+.4f} rad/s')

    def tick(self):
        now = self.get_clock().now().to_msg()

        imu = Imu()
        imu.header.stamp = now
        imu.header.frame_id = 'imu_link'

        imu.orientation_covariance[0] = -1.0  # not provided

        imu.angular_velocity.x = random.gauss(0.0, GYRO_NOISE_STD)
        imu.angular_velocity.y = random.gauss(0.0, GYRO_NOISE_STD)
        imu.angular_velocity.z = GYRO_Z_BIAS + random.gauss(0.0, GYRO_NOISE_STD)
        for i in (0, 4, 8):
            imu.angular_velocity_covariance[i] = GYRO_NOISE_STD ** 2

        imu.linear_acceleration.x = random.gauss(0.0, ACCEL_NOISE_STD)
        imu.linear_acceleration.y = random.gauss(0.0, ACCEL_NOISE_STD)
        imu.linear_acceleration.z = 9.81 + random.gauss(0.0, ACCEL_NOISE_STD)
        for i in (0, 4, 8):
            imu.linear_acceleration_covariance[i] = ACCEL_NOISE_STD ** 2

        self.imu_pub.publish(imu)

        # Temperature drifts slowly upward with a touch of noise
        self.t += 1.0 / 50.0
        self.temp_c = 30.0 + 0.05 * self.t + random.gauss(0.0, 0.05)
        temp = Temperature()
        temp.header.stamp = now
        temp.header.frame_id = 'imu_link'
        temp.temperature = self.temp_c
        temp.variance = 0.05 ** 2
        self.temp_pub.publish(temp)


def main():
    rclpy.init()
    node = ImuNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
