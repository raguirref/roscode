"""
diagnostics — publishes battery state and a /robot_status string so the
studio Topics panel has a variety of message types to show.
Publishes: /battery_state  (sensor_msgs/BatteryState)
           /robot_status   (std_msgs/String)
"""
import math, time
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import BatteryState
from std_msgs.msg import String


class DiagnosticsNode(Node):
    def __init__(self):
        super().__init__('diagnostics')
        self.battery_pub = self.create_publisher(BatteryState, '/battery_state', 5)
        self.status_pub  = self.create_publisher(String,       '/robot_status',  5)

        self.charge   = 0.78   # start at 78 %
        self.start_t  = time.time()

        self.create_timer(1.0, self._publish)
        self.get_logger().info('diagnostics node ready')

    def _publish(self):
        elapsed = time.time() - self.start_t
        self.charge = max(0.0, 0.78 - elapsed * 0.00005)   # drains slowly

        now = self.get_clock().now().to_msg()

        bat = BatteryState()
        bat.header.stamp   = now
        bat.voltage        = 12.0 * self.charge + 8.0      # 8-20 V range
        bat.percentage     = self.charge
        bat.power_supply_status = BatteryState.POWER_SUPPLY_STATUS_DISCHARGING
        self.battery_pub.publish(bat)

        # Status string — drifting warning kicks in after 30 s
        if elapsed > 30:
            status = 'WARN: lateral drift detected (%.3f m)' % (elapsed * 0.012 * 0.05)
        else:
            status = 'OK: robot running normally'
        msg = String()
        msg.data = status
        self.status_pub.publish(msg)


def main():
    rclpy.init()
    rclpy.spin(DiagnosticsNode())
    rclpy.shutdown()
