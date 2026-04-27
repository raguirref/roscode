"""Launch all four robot_demo nodes."""
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(package='robot_demo', executable='robot_base',
             name='robot_base', output='screen'),
        Node(package='robot_demo', executable='imu_node',
             name='imu_node', output='screen'),
        Node(package='robot_demo', executable='cmd_vel_pub',
             name='cmd_vel_pub', output='screen'),
        Node(package='robot_demo', executable='diagnostics',
             name='diagnostics', output='screen'),
    ])
