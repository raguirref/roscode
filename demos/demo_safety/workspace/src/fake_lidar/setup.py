from setuptools import find_packages, setup

package_name = 'fake_lidar'

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
    description='Synthetic LaserScan publisher for the demo_safety scenario.',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'fake_lidar = fake_lidar.fake_lidar:main',
        ],
    },
)
