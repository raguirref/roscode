from setuptools import find_packages, setup

package_name = 'simple_odometry'

setup(
    name=package_name,
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='roscode demo',
    maintainer_email='noreply@example.com',
    description='Simple yaw-integrating odometry node (demo_drift workspace).',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'odometry_node = simple_odometry.odometry_node:main',
            'fake_imu = simple_odometry.fake_imu:main',
        ],
    },
)
