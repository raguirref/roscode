# The roscode agent

Claude Opus 4.7, with ROS 2 superpowers.

**It can:**

- Read every running topic and node
- Inspect publisher / subscriber relationships
- Read & write files in your workspace
- Run `colcon build` and interpret errors
- Execute shell commands (with confirmation for destructive ones)

**Try it:**

```
What topics is my robot publishing right now?
Create a minimal publisher for /cmd_vel in Python.
Build the package `simple_odometry` and explain any warnings.
```

**⌘⇧A** focuses the agent sidebar anytime.
