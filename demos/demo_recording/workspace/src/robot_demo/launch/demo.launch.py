"""
demo.launch.py — launches all four robot_demo nodes at once.

Usage (inside the container, after building):
    source install/setup.bash
    ros2 launch robot_demo demo.launch.py
"""
from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(package='robot_demo', executable='robot_base',  name='robot_base',
             output='screen'),
        Node(package='robot_demo', executable='imu_node',    name='imu_node',
             output='screen'),
        Node(package='robot_demo', executable='cmd_vel_pub', name='cmd_vel_publisher',
             output='screen'),
        Node(package='robot_demo', executable='diagnostics', name='diagnostics',
             output='screen'),
    ])
