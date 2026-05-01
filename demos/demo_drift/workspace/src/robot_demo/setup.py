# src/robot_demo/setup.py (30 lines)
from setuptools import find_packages, setup

package_name = 'robot_demo'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', ['launch/demo.launch.py']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='roscode agent',
    maintainer_email='noreply@example.com',
    description='Demo package: simulated diff-drive base, IMU, cmd_vel publisher, diagnostics',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'robot_base = robot_demo.robot_base:main',
            'imu_node = robot_demo.imu_node:main',
            'cmd_vel_pub = robot_demo.cmd_vel_pub:main',
            'diagnostics = robot_demo.diagnostics:main',
            'cmd_vel_listener = robot_demo.cmd_vel_listener:main',
        ],
    },
)
