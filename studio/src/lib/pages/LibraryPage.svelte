<script lang="ts">
  import { chatMessages, chatSessionActive } from "../stores/layout";
  import { rightPanelOpen } from "../stores/layout";

  interface Pkg {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    apt: string | null;
    repo: string;
    [k: string]: unknown;
  }

  const registry: Pkg[] = [
    { id:"moveit2", name:"MoveIt 2", description:"The standard motion planning framework for ROS 2 manipulators. Inverse kinematics, collision checking, trajectory execution.", category:"manipulators", tags:["planning","arm","IK","6DOF"], apt:"ros-humble-moveit", repo:"https://github.com/moveit/moveit2" },
    { id:"ur_robot_driver", name:"Universal Robots Driver", description:"Official ROS 2 driver for UR3, UR5, UR10, UR16, UR20 series. Real-time control via RTDE.", category:"manipulators", tags:["UR","arm","6DOF","driver"], apt:"ros-humble-ur", repo:"https://github.com/UniversalRobots/Universal_Robots_ROS2_Driver" },
    { id:"ros2_kortex", name:"Kinova Gen3 / Kortex", description:"Driver and MoveIt config for Kinova Gen3 and Gen3 Lite arms. Includes URDF and Gazebo simulation.", category:"manipulators", tags:["Kinova","arm","7DOF","driver"], apt:null, repo:"https://github.com/Kinovarobotics/ros2_kortex" },
    { id:"franka_ros2", name:"Franka Panda", description:"ROS 2 support for Franka Research 3 and Panda. ros2_control integration with torque-level control.", category:"manipulators", tags:["Franka","arm","7DOF","torque"], apt:null, repo:"https://github.com/frankaemika/franka_ros2" },
    { id:"ros2_control", name:"ros2_control", description:"Hardware abstraction layer for ROS 2. Connects any actuator or sensor to a unified controller interface.", category:"manipulators", tags:["control","hardware","abstraction"], apt:"ros-humble-ros2-control", repo:"https://github.com/ros-controls/ros2_control" },
    { id:"nav2", name:"Nav2", description:"The ROS 2 navigation stack. Costmaps, path planning (A*, Dijkstra, DWB), AMCL localization, behavior trees.", category:"mobile", tags:["navigation","AMCL","path-planning","costmap"], apt:"ros-humble-navigation2", repo:"https://github.com/ros-navigation/navigation2" },
    { id:"slam_toolbox", name:"slam_toolbox", description:"Lifelong SLAM for 2D lidar. Supports online, offline, and localization-only modes with loop closure.", category:"mobile", tags:["SLAM","lidar","mapping","localization"], apt:"ros-humble-slam-toolbox", repo:"https://github.com/SteveMacenski/slam_toolbox" },
    { id:"turtlebot3", name:"TurtleBot 3", description:"Full ROS 2 support for TurtleBot3 Burger and Waffle. Includes Gazebo simulation, navigation, and SLAM demos.", category:"mobile", tags:["TurtleBot","differential","simulation","education"], apt:"ros-humble-turtlebot3", repo:"https://github.com/ROBOTIS-GIT/turtlebot3" },
    { id:"husarion_rosbot", name:"Husarion ROSbot 2R / XL", description:"ROS 2 driver for Husarion ROSbot platforms. Differential (2R) and mecanum (XL) configurations.", category:"mobile", tags:["ROSbot","differential","mecanum","holonomic"], apt:null, repo:"https://github.com/husarion/rosbot_ros" },
    { id:"cartographer_ros", name:"Google Cartographer", description:"Real-time 2D and 3D SLAM via submap-based graph optimization. Supports lidar and IMU fusion.", category:"mobile", tags:["SLAM","3D","lidar","IMU","Google"], apt:null, repo:"https://github.com/cartographer-project/cartographer_ros" },
    { id:"realsense_ros", name:"Intel RealSense", description:"ROS 2 wrapper for Intel RealSense D400, L500, and T265 series. RGB-D pointclouds, IMU, tracking.", category:"sensors", tags:["depth","RGB-D","pointcloud","IMU"], apt:"ros-humble-realsense2-camera", repo:"https://github.com/IntelRealSense/realsense-ros" },
    { id:"rplidar_ros", name:"RPLIDAR", description:"Driver for Slamtec RPLIDAR A-series, S-series, and C-series 2D lidars.", category:"sensors", tags:["lidar","2D","laser-scan"], apt:"ros-humble-rplidar-ros", repo:"https://github.com/Slamtec/rplidar_ros" },
    { id:"velodyne", name:"Velodyne LiDAR", description:"ROS 2 driver for Velodyne VLP-16, VLP-32C, HDL-64E 3D lidars. Pointcloud and packet modes.", category:"sensors", tags:["lidar","3D","pointcloud","Velodyne"], apt:"ros-humble-velodyne", repo:"https://github.com/ros-drivers/velodyne" },
    { id:"zed_ros2", name:"ZED Stereo Camera", description:"ROS 2 wrapper for Stereolabs ZED, ZED 2, ZED Mini, ZED X. Depth, pose, skeleton tracking, object detection.", category:"sensors", tags:["stereo","depth","pose","NVIDIA"], apt:null, repo:"https://github.com/stereolabs/zed-ros2-wrapper" },
    { id:"isaac_ros_common", name:"NVIDIA Isaac ROS", description:"GPU-accelerated ROS 2 packages for perception: AprilTag, NITROS, visual SLAM, object detection on Jetson and x86.", category:"sensors", tags:["NVIDIA","GPU","Jetson","perception","AI"], apt:null, repo:"https://github.com/NVIDIA-ISAAC-ROS/isaac_ros_common" },
    { id:"ros_gz", name:"Gazebo (Ignition) Bridge", description:"ros_gz bridge connects ROS 2 topics/services to Gazebo Ignition/Fortress/Garden simulations.", category:"simulation", tags:["Gazebo","simulation","bridge","physics"], apt:"ros-humble-ros-gz", repo:"https://github.com/gazebosim/ros_gz" },
    { id:"webots_ros2", name:"Webots ROS 2", description:"Official Webots robot simulator integration for ROS 2. Includes TurtleBot, Universal Robots, and custom robot support.", category:"simulation", tags:["Webots","simulation","open-source"], apt:"ros-humble-webots-ros2", repo:"https://github.com/cyberbotics/webots_ros2" },
    { id:"foxglove_bridge", name:"Foxglove Bridge", description:"WebSocket bridge to stream ROS 2 topics, services, and parameters to Foxglove Studio for visualization.", category:"utilities", tags:["visualization","WebSocket","debugging"], apt:"ros-humble-foxglove-bridge", repo:"https://github.com/foxglove/ros-foxglove-bridge" },
    { id:"rosbag2", name:"rosbag2", description:"Record and replay ROS 2 topic data. Supports SQLite and MCAP storage backends. Essential for debugging and dataset collection.", category:"utilities", tags:["recording","replay","MCAP","datasets"], apt:"ros-humble-rosbag2", repo:"https://github.com/ros2/rosbag2" },
    { id:"diagnostic_updater", name:"diagnostics", description:"Hardware diagnostic framework. Publishes health status for motors, sensors, and computers to /diagnostics.", category:"utilities", tags:["health","monitoring","hardware"], apt:"ros-humble-diagnostics", repo:"https://github.com/ros/diagnostics" },
  ];

  const CATEGORIES = ["all", "manipulators", "mobile", "sensors", "simulation", "utilities"] as const;
  type Cat = (typeof CATEGORIES)[number];

  let query = "";
  let activeCategory: Cat = "all";
  let selected: Pkg = registry[0];
  let installToast = "";

  $: filtered = registry.filter((p) => {
    const matchCat = activeCategory === "all" || p.category === activeCategory;
    if (!matchCat) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  $: if (filtered.length && !filtered.includes(selected)) selected = filtered[0];

  function install(pkg: Pkg) {
    const prompt = pkg.apt
      ? `Install the ROS 2 package ${pkg.name} (apt: ${pkg.apt}) in the ROS container and verify it installed correctly.`
      : `Install the ROS 2 package ${pkg.name} from source (repo: ${pkg.repo}) in the container workspace.`;

    chatMessages.update((ms) => [...ms, { kind: "user", text: prompt }]);
    chatSessionActive.set(false);
    rightPanelOpen.set(true);
    installToast = `Queued install of ${pkg.name} — see Agent panel →`;
    setTimeout(() => (installToast = ""), 3000);
  }

  function catCount(cat: string) {
    return cat === "all" ? registry.length : registry.filter((p) => p.category === cat).length;
  }
</script>

<div class="page">
  <!-- ── Left list ── -->
  <div class="list-col">
    <div class="list-top">
      <div class="label-sm">// PKG INDEX</div>
      <div class="page-title">library</div>
    </div>

    <!-- search -->
    <div class="search-wrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input
        class="search-input"
        type="text"
        placeholder="search {registry.length} packages…"
        bind:value={query}
      />
      {#if query}
        <button class="clear-x" on:click={() => (query = "")}>✕</button>
      {/if}
    </div>

    <!-- category pills -->
    <div class="pill-row">
      {#each CATEGORIES as cat}
        <button class="pill" class:active={activeCategory === cat} on:click={() => (activeCategory = cat)}>
          {cat.toUpperCase()} {catCount(cat)}
        </button>
      {/each}
    </div>

    <!-- package list -->
    <div class="pkg-list">
      {#if filtered.length === 0}
        <div class="empty">no packages match "{query}"</div>
      {/if}
      {#each filtered as p}
        <button class="pkg-row" class:sel={p === selected} on:click={() => (selected = p)}>
          <div class="pkg-row-top">
            <div class="pkg-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8l-9 5-9-5M21 8v8l-9 5-9-5V8M21 8l-9-5-9 5"/></svg>
            </div>
            <div class="pkg-id">{p.id}</div>
            {#if p.apt}
              <div class="apt-dot" title="Available via apt"></div>
            {/if}
          </div>
          <div class="pkg-desc-short">{p.description.substring(0, 60)}...</div>
          <div class="pkg-row-foot">
            <div class="pkg-cat">{p.category}</div>
            <div class="pkg-mini-tags">
              {#each p.tags.slice(0, 2) as t}
                <span class="mini-tag">{t}</span>
              {/each}
            </div>
          </div>
        </button>
      {/each}
    </div>
  </div>

  <!-- ── Detail ── -->
  <div class="detail-col">
    {#if selected}
      <!-- header -->
      <div class="pkg-header">
        <div class="pkg-icon-lg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8l-9 5-9-5M21 8v8l-9 5-9-5V8M21 8l-9-5-9 5"/></svg>
        </div>
        <div class="pkg-header-info">
          <div class="pkg-name">{selected.name}</div>
          <div class="pkg-id-big">{selected.id}</div>
          <div class="tag-row">
            <span class="cat-pill">{selected.category.toUpperCase()}</span>
            {#each selected.tags as t}
              <span class="tag">{t}</span>
            {/each}
          </div>
        </div>
        <div class="pkg-actions">
          <button class="install-btn" on:click={() => install(selected)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 16l-6-6h4V4h4v6h4l-6 6z"/><rect x="4" y="18" width="16" height="2" rx="1"/></svg>
            INSTALL
          </button>
          {#if selected.apt}
            <div class="apt-label">apt: {selected.apt}</div>
          {:else}
            <div class="apt-label src">source install</div>
          {/if}
        </div>
      </div>

      <!-- toast -->
      {#if installToast}
        <div class="toast">{installToast}</div>
      {/if}

      <!-- description -->
      <div class="panel desc-panel">
        <div class="panel-header">
          <span class="mono-label">README</span>
          <span class="compat-pills">
            <span class="compat humble">HUMBLE</span>
            <span class="compat iron">IRON</span>
          </span>
        </div>
        <div class="readme">
          <p class="desc">{selected.description}</p>

          {#if selected.apt}
            <div class="code-block">
              <div class="comment"># apt install</div>
              <div><span class="dollar">$</span> sudo apt install -y {selected.apt}</div>
            </div>
          {:else}
            <div class="code-block">
              <div class="comment"># source install — use the agent to install</div>
              <div><span class="dollar">$</span> cd ~/ros2_ws/src && git clone {selected.repo}</div>
              <div><span class="dollar">$</span> cd ~/ros2_ws && colcon build --packages-select {selected.id}</div>
            </div>
          {/if}

          <a class="repo-link" href={selected.repo} target="_blank" rel="noreferrer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            {selected.repo.replace("https://github.com/", "")}
          </a>
        </div>
      </div>

      <!-- tags -->
      <div class="panel tags-panel">
        <div class="panel-header"><span class="mono-label">TAGS</span></div>
        <div class="tags-body">
          {#each selected.tags as t}
            <button class="tag-btn" on:click={() => { query = t; }}>
              #{t}
            </button>
          {/each}
        </div>
      </div>

      <!-- install via agent CTA -->
      <div class="agent-cta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="var(--accent)"/></svg>
        <span class="cta-text">Let the agent install and configure <strong>{selected.name}</strong> for your workspace</span>
        <button class="cta-btn" on:click={() => install(selected)}>Ask Agent →</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { flex:1; overflow:hidden; display:grid; grid-template-columns:280px 1fr; min-height:0; }

  /* ── List column ── */
  .list-col {
    border-right:1px solid var(--border); background:var(--bg-1);
    padding:16px 12px; display:flex; flex-direction:column; gap:10px; overflow:hidden;
  }
  .list-top { flex-shrink:0; }
  .label-sm { font-family:var(--font-mono); font-size:10px; color:var(--accent); letter-spacing:2px; text-transform:uppercase; }
  .page-title { font-size:20px; font-weight:600; letter-spacing:-.3px; margin-top:2px; }

  .search-wrap {
    display:flex; align-items:center; gap:7px;
    padding:6px 10px; background:var(--bg-2); border:1px solid var(--border);
    border-radius:var(--radius); flex-shrink:0;
  }
  .search-wrap:focus-within { border-color:var(--accent-line); }
  .search-input {
    flex:1; background:transparent; border:none; color:var(--fg-0);
    font-family:var(--font-mono); font-size:11px; outline:none;
  }
  .search-input::placeholder { color:var(--fg-3); }
  .clear-x {
    background:transparent; border:none; color:var(--fg-3); cursor:pointer;
    font-size:10px; padding:0 2px; line-height:1;
  }

  .pill-row { display:flex; gap:4px; flex-wrap:wrap; flex-shrink:0; }
  .pill {
    padding:3px 7px; border:1px solid var(--border); border-radius:var(--radius);
    font-family:var(--font-mono); font-size:9px; color:var(--fg-2); letter-spacing:.3px;
    cursor:pointer; background:transparent; text-transform:uppercase;
  }
  .pill.active { background:var(--accent-dim); border-color:var(--accent-line); color:var(--accent); }
  .pill:hover:not(.active) { border-color:var(--border-bright); color:var(--fg-1); }

  .pkg-list { flex:1; overflow:auto; display:flex; flex-direction:column; gap:8px; background:transparent; border:none; }
  .empty { padding:16px; font-family:var(--font-mono); font-size:11px; color:var(--fg-3); text-align:center; }

  .pkg-row {
    display:flex; flex-direction:column; gap:8px; padding:12px;
    background:var(--bg-2); border:1px solid var(--border); border-radius:8px;
    width:100%; text-align:left; cursor:pointer;
    transition: all 150ms ease;
  }
  .pkg-row.sel { background:var(--accent-dim); border-color:var(--accent-line); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .pkg-row:hover:not(.sel) { border-color:var(--border-bright); background:var(--bg-3); }
  
  .pkg-row-top { display:flex; align-items:center; gap:10px; }
  .pkg-icon {
    width:24px; height:24px; border-radius:4px; background:var(--bg-1); border:1px solid var(--border);
    display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--accent);
  }
  .pkg-id { font-family:var(--font-mono); font-size:12px; font-weight:600; color:var(--fg-0); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .apt-dot { width:6px; height:6px; border-radius:50%; background:var(--ok); box-shadow: 0 0 6px var(--ok); }

  .pkg-desc-short { font-size:11px; color:var(--fg-3); line-height:1.4; height:31px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }

  .pkg-row-foot { display:flex; align-items:center; justify-content:space-between; margin-top:2px; }
  .pkg-cat { font-family:var(--font-mono); font-size:9px; color:var(--accent3); text-transform:uppercase; letter-spacing:.5px; }
  .pkg-mini-tags { display:flex; gap:4px; }
  .mini-tag { font-family:var(--font-mono); font-size:8px; color:var(--fg-3); border:1px solid var(--border); padding:1px 4px; border-radius:3px; text-transform:uppercase; }

  /* ── Detail column ── */
  .detail-col { display:flex; flex-direction:column; gap:12px; padding:18px; overflow:auto; }

  .pkg-header { display:flex; align-items:flex-start; gap:16px; flex-shrink:0; }
  .pkg-icon-lg {
    width:64px; height:64px; border-radius:var(--radius);
    background:var(--accent-dim); border:1px solid var(--accent-line);
    display:flex; align-items:center; justify-content:center; color:var(--accent); flex-shrink:0;
  }
  .pkg-header-info { flex:1; min-width:0; }
  .pkg-name { font-size:24px; font-weight:600; letter-spacing:-.4px; line-height:1; }
  .pkg-id-big { font-family:var(--font-mono); font-size:11px; color:var(--fg-2); margin-top:3px; }
  .tag-row { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
  .cat-pill { padding:3px 8px; border:1px solid var(--accent-line); border-radius:var(--radius); font-family:var(--font-mono); font-size:9px; color:var(--accent); background:var(--accent-dim); }
  .tag { padding:2px 7px; border:1px solid var(--border-bright); border-radius:var(--radius); font-family:var(--font-mono); font-size:9px; color:var(--fg-2); }

  .pkg-actions { display:flex; flex-direction:column; gap:6px; align-items:flex-end; flex-shrink:0; }
  .install-btn {
    display:flex; align-items:center; gap:6px;
    padding:7px 14px; background:var(--accent); color:#1a1408;
    border:1px solid var(--accent); border-radius:var(--radius);
    font-family:var(--font-mono); font-size:10px; font-weight:600; letter-spacing:.5px;
    cursor:pointer; white-space:nowrap;
  }
  .install-btn:hover { opacity:.9; }
  .apt-label { font-family:var(--font-mono); font-size:9px; color:var(--fg-3); text-align:right; }
  .apt-label.src { color:var(--warn); }

  .toast {
    background:rgba(139,195,74,.12); border:1px solid rgba(139,195,74,.3);
    border-radius:var(--radius); padding:8px 14px;
    font-family:var(--font-mono); font-size:11px; color:var(--ok);
    animation:fadein .15s ease;
  }
  @keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }

  .panel { background:var(--bg-2); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
  .panel-header { display:flex; align-items:center; justify-content:space-between; padding:9px 14px; border-bottom:1px solid var(--border); }
  .mono-label { font-family:var(--font-mono); font-size:10px; color:var(--fg-2); letter-spacing:1.5px; text-transform:uppercase; }

  .compat-pills { display:flex; gap:4px; }
  .compat { font-family:var(--font-mono); font-size:9px; padding:2px 6px; border-radius:var(--radius); }
  .compat.humble { border:1px solid rgba(139,195,74,.3); color:var(--ok); }
  .compat.iron { border:1px solid var(--border); color:var(--fg-3); }

  .readme { padding:16px; display:flex; flex-direction:column; gap:10px; }
  .desc { font-size:13px; color:var(--fg-1); line-height:1.65; margin:0; }
  .code-block {
    padding:10px 14px; background:#080b09; border-radius:var(--radius);
    border:1px solid var(--border); font-family:var(--font-mono); font-size:12px; line-height:1.7; color:var(--fg-0);
  }
  .comment { color:var(--fg-3); }
  .dollar { color:var(--accent); }
  .repo-link {
    display:inline-flex; align-items:center; gap:5px;
    font-family:var(--font-mono); font-size:11px; color:var(--fg-2);
    text-decoration:none; width:fit-content;
  }
  .repo-link:hover { color:var(--accent); }

  .tags-panel {}
  .tags-body { display:flex; flex-wrap:wrap; gap:6px; padding:12px 14px; }
  .tag-btn {
    padding:4px 9px; border:1px solid var(--border-bright); border-radius:var(--radius);
    font-family:var(--font-mono); font-size:10px; color:var(--fg-2); background:transparent; cursor:pointer;
  }
  .tag-btn:hover { border-color:var(--accent-line); color:var(--accent); }

  .agent-cta {
    display:flex; align-items:center; gap:10px;
    padding:12px 16px; background:var(--accent-dim);
    border:1px solid var(--accent-line); border-radius:var(--radius);
  }
  .cta-text { flex:1; font-size:12px; color:var(--fg-1); line-height:1.4; }
  .cta-text strong { color:var(--fg-0); }
  .cta-btn {
    padding:6px 14px; background:var(--accent); color:#1a1408;
    border:none; border-radius:var(--radius); font-family:var(--font-mono);
    font-size:10px; font-weight:600; letter-spacing:.4px; cursor:pointer; white-space:nowrap;
  }
  .cta-btn:hover { opacity:.9; }
</style>
