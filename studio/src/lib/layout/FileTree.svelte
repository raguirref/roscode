<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { openFile } from "../stores/layout";

  export let workspacePath = "";

  const dispatch = createEventDispatcher<{ fileopen: { path: string; name: string; language: string; content: string } }>();

  const DEMO_TREE = [
    {
      name: "src",
      type: "dir",
      open: true,
      children: [
        {
          name: "simple_odometry",
          type: "dir",
          open: true,
          children: [
            { name: "odometry_node.py", type: "file", lang: "python",
              content: `#!/usr/bin/env python3
"""Simple odometry publisher with injected yaw bias (demo bug)."""
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
from sensor_msgs.msg import Imu
import math

# BUG: yaw_bias should be 0.0 for accurate odometry
yaw_bias = 0.05  # rad/s — intentional drift

class OdometryNode(Node):
    def __init__(self):
        super().__init__('odometry_node')
        self.pub = self.create_publisher(Odometry, '/odom', 10)
        self.sub = self.create_subscription(Imu, '/imu', self.imu_cb, 10)
        self.yaw = 0.0
        self.timer = self.create_timer(0.05, self.publish_odom)

    def imu_cb(self, msg: Imu):
        dt = 0.05
        # Apply biased angular velocity integration
        self.yaw += (msg.angular_velocity.z + yaw_bias) * dt
        self.yaw = math.fmod(self.yaw, 2 * math.pi)

    def publish_odom(self):
        msg = Odometry()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'odom'
        msg.child_frame_id = 'base_link'
        q = yaw_to_quat(self.yaw)
        msg.pose.pose.orientation.x = q[0]
        msg.pose.pose.orientation.y = q[1]
        msg.pose.pose.orientation.z = q[2]
        msg.pose.pose.orientation.w = q[3]
        self.pub.publish(msg)

def yaw_to_quat(yaw):
    return [0.0, 0.0, math.sin(yaw/2), math.cos(yaw/2)]

def main():
    rclpy.init()
    rclpy.spin(OdometryNode())
    rclpy.shutdown()

if __name__ == '__main__':
    main()
`},
            { name: "fake_imu.py", type: "file", lang: "python",
              content: `#!/usr/bin/env python3
"""Fake IMU publisher for demo workspace."""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Imu
import math, random

class FakeImu(Node):
    def __init__(self):
        super().__init__('fake_imu')
        self.pub = self.create_publisher(Imu, '/imu', 10)
        self.t = 0.0
        self.timer = self.create_timer(0.05, self.publish)

    def publish(self):
        msg = Imu()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'imu_link'
        msg.angular_velocity.z = 0.1 * math.sin(0.5 * self.t) + random.gauss(0, 0.002)
        msg.linear_acceleration.x = random.gauss(0, 0.01)
        msg.linear_acceleration.y = random.gauss(0, 0.01)
        msg.linear_acceleration.z = 9.81 + random.gauss(0, 0.01)
        self.pub.publish(msg)
        self.t += 0.05

def main():
    rclpy.init()
    rclpy.spin(FakeImu())
    rclpy.shutdown()
`},
            { name: "package.xml", type: "file", lang: "xml",
              content: `<?xml version="1.0"?>
<package format="3">
  <name>simple_odometry</name>
  <version>0.0.1</version>
  <description>Simple odometry node for demo.</description>
  <maintainer email="demo@roscode.ai">roscode</maintainer>
  <license>MIT</license>
  <depend>rclpy</depend>
  <depend>nav_msgs</depend>
  <depend>sensor_msgs</depend>
</package>
`},
            { name: "setup.py", type: "file", lang: "python",
              content: `from setuptools import find_packages, setup

setup(
    name='simple_odometry',
    version='0.0.1',
    packages=find_packages(exclude=['test']),
    install_requires=['setuptools'],
    entry_points={
        'console_scripts': [
            'odometry_node = simple_odometry.odometry_node:main',
            'fake_imu = simple_odometry.fake_imu:main',
        ],
    },
)
`},
          ],
        },
      ],
    },
  ];

  interface TreeNode {
    name: string;
    type: "file" | "dir";
    lang?: string;
    content?: string;
    open?: boolean;
    children?: TreeNode[];
  }

  let tree: TreeNode[] = DEMO_TREE as TreeNode[];
  let selected: string | null = null;

  function toggle(node: TreeNode) {
    node.open = !node.open;
    tree = [...tree];
  }

  function clickFile(node: TreeNode, parentPath: string) {
    const fullPath = `${workspacePath || "/workspace"}/src/${parentPath}${node.name}`;
    selected = fullPath;
    const tab = {
      path: fullPath,
      name: node.name,
      language: node.lang ?? "plaintext",
      content: node.content ?? "",
      dirty: false,
    };
    openFile(tab);
    dispatch("fileopen", tab);
  }

  function langIcon(lang?: string) {
    if (lang === "python") return "🐍";
    if (lang === "xml") return "📄";
    if (lang === "yaml") return "⚙";
    if (lang === "json") return "{}";
    return "📝";
  }

  function renderNodes(nodes: TreeNode[], depth: number, parentPath: string) {
    return nodes;
  }
</script>

<div class="file-tree">
  <div class="tree-label">
    <span>EXPLORER</span>
    <span class="ws-name">{workspacePath ? workspacePath.split("/").pop() : "workspace"}</span>
  </div>
  <div class="tree-body">
    {#each tree as node}
      {#if node.type === "dir"}
        <button class="dir-row" on:click={() => toggle(node)}>
          <svg class="chevron" class:open={node.open} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="dir-icon">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{node.name}</span>
        </button>
        {#if node.open && node.children}
          <div class="children">
            {#each node.children as child}
              {#if child.type === "dir"}
                <button class="dir-row indent" on:click={() => toggle(child)}>
                  <svg class="chevron" class:open={child.open} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="dir-icon">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>{child.name}</span>
                </button>
                {#if child.open && child.children}
                  <div class="children">
                    {#each child.children as leaf}
                      {#if leaf.type === "file"}
                        <button
                          class="file-row"
                          class:selected={selected?.endsWith(leaf.name)}
                          on:click={() => clickFile(leaf, `${child.name}/`)}
                        >
                          <span class="file-icon">{langIcon(leaf.lang)}</span>
                          <span class="file-name">{leaf.name}</span>
                        </button>
                      {/if}
                    {/each}
                  </div>
                {/if}
              {/if}
            {/each}
          </div>
        {/if}
      {/if}
    {/each}
  </div>
</div>

<style>
  .file-tree { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .tree-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--fg-1);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .ws-name { font-size: 10px; color: var(--fg-2); text-transform: none; letter-spacing: 0; }

  .tree-body { flex: 1; overflow-y: auto; padding: 4px 0; }

  .dir-row, .file-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: transparent;
    border: none;
    border-radius: 0;
    font-size: 12px;
    color: var(--fg-1);
    cursor: pointer;
    text-align: left;
  }
  .dir-row:hover, .file-row:hover { background: var(--bg-2); color: var(--fg-0); border: none; }
  .file-row.selected { background: rgba(76,201,240,0.12); color: var(--fg-0); }

  .indent { padding-left: 20px; }

  .children { padding-left: 0; }

  .chevron { transform: rotate(0deg); transition: transform 150ms; color: var(--fg-2); flex-shrink: 0; }
  .chevron.open { transform: rotate(90deg); }

  .dir-icon { color: var(--accent-warm); opacity: 0.8; flex-shrink: 0; }

  .file-row { padding-left: 44px; }
  .file-icon { flex-shrink: 0; font-size: 11px; }
  .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
