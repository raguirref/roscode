# Network discovery

The #1 pain point in ROS: manually setting `ROS_MASTER_URI` / `ROS_DOMAIN_ID`.

roscode scans your LAN on startup:

- **ROS 1** — probes port `11311` (rosmaster)
- **ROS 2** — probes DDS ports `7400-7402`

Each detected host appears in the **Network** sidebar with its IP, ROS version, and hostname. One click and roscode sets the right env vars and validates the connection.
