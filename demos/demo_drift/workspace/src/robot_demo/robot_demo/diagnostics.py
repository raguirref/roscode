#!/usr/bin/env python3
"""Diagnostics publisher.

Publishes:
  /battery_state (sensor_msgs/BatteryState) — slowly draining from 78%
  /robot_status  (std_msgs/String)          — short human-readable status
Both at 1 Hz.
"""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import BatteryState
from std_msgs.msg import String


class Diagnostics(Node):
    def __init__(self):
        super().__init__('diagnostics')

        self.batt_pub = self.create_publisher(BatteryState, '/battery_state', 10)
        self.status_pub = self.create_publisher(String, '/robot_status', 10)

        self.percentage = 0.78  # 78 %
        self.drain_per_sec = 0.001  # 0.1 % / s — visible in a short demo

        self.timer = self.create_timer(1.0, self.tick)
        self.get_logger().info('diagnostics up — 1 Hz')

    def tick(self):
        now = self.get_clock().now().to_msg()

        # Drain
        self.percentage = max(0.0, self.percentage - self.drain_per_sec)

        batt = BatteryState()
        batt.header.stamp = now
        batt.header.frame_id = 'base_link'
        batt.voltage = 11.1 + 1.5 * self.percentage   # ~12.6V full → 11.1V empty
        batt.current = -1.2                            # discharging
        batt.charge = float('nan')
        batt.capacity = float('nan')
        batt.design_capacity = 5.0
        batt.percentage = self.percentage
        batt.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_DISCHARGING
        batt.power_supply_health = BatteryState.POWER_SUPPLY_HEALTH_GOOD
        batt.power_supply_technology = BatteryState.POWER_SUPPLY_TECHNOLOGY_LIPO
        batt.present = True
        self.batt_pub.publish(batt)

        if self.percentage > 0.20:
            health = 'OK'
        elif self.percentage > 0.05:
            health = 'LOW_BATTERY'
        else:
            health = 'CRITICAL'

        status = String()
        status.data = f'status={health} batt={self.percentage * 100.0:.1f}%'
        self.status_pub.publish(status)


def main():
    rclpy.init()
    node = Diagnostics()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
