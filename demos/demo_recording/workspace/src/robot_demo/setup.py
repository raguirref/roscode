from setuptools import setup
import os
from glob import glob

package_name = 'robot_demo'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='roscode',
    maintainer_email='demo@roscode.io',
    description='roscode recording demo',
    license='MIT',
    entry_points={
        'console_scripts': [
            'robot_base   = robot_demo.robot_base:main',
            'imu_node     = robot_demo.imu_node:main',
            'cmd_vel_pub  = robot_demo.cmd_vel_pub:main',
            'diagnostics  = robot_demo.diagnostics:main',
        ],
    },
)
