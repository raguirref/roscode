# roscode studio — Implementation Plan

> **Instrucción general**: Trabaja fase por fase en orden estricto. Al terminar cada fase entrega un checkpoint (qué construiste, qué saltaste, por qué, cómo se ve) y pregunta "¿procedo con Fase N+1?" antes de continuar. Lee todo este documento antes de escribir una sola línea de código.

---

## Contexto crítico: por qué este approach

El objetivo es una IDE con identidad propia — **no una extensión sobre VS Code**. Queremos el motor de VS Code (Electron, Monaco, LSP) pero sin que se vea como VS Code en absolutamente nada.

**Estrategia**: patchear el binario de VSCodium ya compilado que existe en `vscodium-build/VSCodium.zip`. **No compilamos source** — cada build tarda 40 min y hace imposible iterar. Modificamos el bundle en disco, igual que lo hacen muchos forks reales de VS Code para demos y hackathons.

El pipeline es:
```
VSCodium.zip  →  unzip  →  patch product.json  →  inject CSS nuclear
             →  copy built-in extension  →  repack  →  roscode studio.app
```

Cada iteración tarda segundos, no 40 minutos.

---

## Reglas que NUNCA se rompen

- `DESTRUCTIVE_TOOLS` gate en `agent.py` y `AgentView.ts` — nunca se modifica sin discusión explícita.
- `robot_estop` — nunca lleva gate de confirmación, es failsafe autónomo.
- `pytest tests/` debe quedar en verde (56 tests) después de cualquier cambio en `roscode/`.
- `ANTHROPIC_API_KEY` siempre de env, jamás hardcodeado.
- Webview CSP: todos los assets via `webview.asWebviewUri`, llamadas a Anthropic desde el extension host, nunca desde el webview.

---

## Fase A — Bundle patch pipeline

**Goal**: `scripts/patch-bundle.sh` que toma `vscodium-build/VSCodium.zip` y produce `roscode-studio-build/roscode studio.app` listo para abrir, con identidad propia y sin chrome de VS Code visible.

### A1 — Crear `scripts/patch-bundle.sh`

El script hace exactamente esto en orden:

```bash
#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$REPO_ROOT/vscodium-build/VSCodium.zip"
WORK="$REPO_ROOT/vscodium-build/work"
OUT="$REPO_ROOT/roscode-studio-build/roscode studio.app"
EXT_SRC="$REPO_ROOT/roscode-extension"

# 1. Unzip fresco
rm -rf "$WORK" && mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"

APP=$(find "$WORK" -name "*.app" -maxdepth 2 | head -1)
RESOURCES="$APP/Contents/Resources/app"

# 2. Patch product.json
python3 "$REPO_ROOT/scripts/patch-product.py" "$RESOURCES/product.json"

# 3. Inject CSS nuclear en workbench.html
python3 "$REPO_ROOT/scripts/inject-css.py" "$RESOURCES/out/vs/workbench/workbench.web.main.nls.js"
# También en el HTML de arranque si existe
for html in "$RESOURCES/out/vs/workbench/workbench.html" \
            "$APP/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html"; do
  [ -f "$html" ] && python3 "$REPO_ROOT/scripts/inject-css.py" "$html"
done

# 4. Copiar iconos custom
cp "$REPO_ROOT/roscode-studio-build/roscode-studio.icns" \
   "$APP/Contents/Resources/VSCodium.icns"

# 5. Build extensión si hay cambios
cd "$EXT_SRC" && pnpm run package --silent

# 6. Instalar extensión como built-in
BUILTIN="$RESOURCES/extensions/roscode"
rm -rf "$BUILTIN" && mkdir -p "$BUILTIN"
# Extraer el .vsix (es un zip)
unzip -q "$EXT_SRC/roscode-0.1.0.vsix" -d "$BUILTIN/tmp"
cp -r "$BUILTIN/tmp/extension/." "$BUILTIN/"
rm -rf "$BUILTIN/tmp"

# 7. Copiar output al destino final
rm -rf "$OUT"
cp -r "$APP" "$OUT"

echo "✅ roscode studio.app listo en roscode-studio-build/"
```

### A2 — `scripts/patch-product.py`

Edita `product.json` en el bundle para quitar toda identidad de VSCodium/VS Code:

```python
import json, sys, pathlib

p = pathlib.Path(sys.argv[1])
d = json.loads(p.read_text())

d.update({
    "nameShort": "roscode",
    "nameLong": "roscode studio",
    "applicationName": "roscode-studio",
    "dataFolderName": ".roscode-studio",
    "win32MutexName": "roscodestudio",
    "licenseName": "MIT",
    "licenseUrl": "https://github.com/raguirref/roscode/blob/main/LICENSE",
    "reportIssueUrl": "https://github.com/raguirref/roscode/issues",
})

# Eliminar marketplace, telemetría, bienvenida de VS Code
for key in ["extensionsGallery", "extensionTips", "extensionImportantTips",
            "extensionKeywords", "keymapExtensionTips", "webExtensionTips",
            "languageExtensionTips", "trustedExtensionAuthAccess",
            "linkProtectionTrustedDomains", "welcomePage",
            "enableTelemetry", "sendASmile", "surveys"]:
    d.pop(key, None)

p.write_text(json.dumps(d, indent=2))
print(f"✅ product.json patcheado")
```

### A3 — `scripts/inject-css.py`

Inyecta el CSS nuclear que oculta TODO el chrome de VS Code. Este es el paso más importante del proyecto — si no se ve bien aquí, nada más importa.

```python
import sys, pathlib, re

target = pathlib.Path(sys.argv[1])
content = target.read_text(encoding="utf-8")

NUCLEAR_CSS = """
<style id="roscode-nuclear">
/* ═══ NUCLEAR: ocultar TODO el chrome de VS Code ═══ */

/* Activity bar (izquierda con íconos) */
.activitybar { display: none !important; }

/* Sidebar (explorer, search, etc.) */
.sidebar { display: none !important; }

/* Status bar inferior */
.part.statusbar { display: none !important; }

/* Menú nativo (File Edit Selection...) */
.menubar { display: none !important; }

/* Tabs de archivos abiertos */
.tabs-and-actions-container { display: none !important; }

/* Breadcrumbs */
.breadcrumbs-below-tabs, .breadcrumb-item { display: none !important; }

/* Title bar de Electron */
.part.titlebar .window-controls-container { opacity: 0 !important; }
.part.titlebar { background: #0d1117 !important; border: none !important; }
.monaco-title-bar { background: #0d1117 !important; }

/* Notificaciones pop-up de VS Code */
.notifications-toasts { display: none !important; }

/* Welcome tab, walkthrough */
.gettingStartedContainer { display: none !important; }

/* Background general */
body, .monaco-workbench {
  background: #0d1117 !important;
  font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif !important;
}

/* Editor area — solo visible cuando se pide explícitamente */
.part.editor {
  background: #0d1117 !important;
}

/* Scrollbars */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #4cc9f0; }

/* Focus outline: usar color cyan */
:focus-visible { outline-color: #4cc9f0 !important; }
</style>
"""

# Inyectar en HTML
if target.suffix == ".html":
    content = content.replace("</head>", NUCLEAR_CSS + "\n</head>", 1)
    target.write_text(content, encoding="utf-8")
    print(f"✅ CSS inyectado en {target.name}")
else:
    print(f"⚠️  {target.name} no es HTML, saltando")
```

### A4 — Verificación de Fase A

Después de correr `./scripts/patch-bundle.sh`:
- Abrir `roscode studio.app`
- Verificar: sin activity bar, sin status bar, sin menú, sin tabs, fondo `#0d1117`
- Verificar: la extensión `roscode` cargó automáticamente (sin instalar manualmente)
- Verificar: el ícono en el dock es el roscode cyan, no el VSCodium azul

---

## Fase B — Launcher Cursor-style

**Goal**: Cuando se abre la app sin carpeta → pantalla de bienvenida minimalista que NO parece VS Code en nada. Referencia exacta: Cursor launcher.

### B1 — Desactivar la bienvenida de VS Code

En `roscode-extension/src/extension.ts`, dentro de `activate()`:

```typescript
// Ocultar workbench nativo en el primer frame
await vscode.commands.executeCommand('workbench.action.closeAllEditors');
await vscode.commands.executeCommand('workbench.action.closeSidebar');
await vscode.commands.executeCommand('workbench.action.closePanel');

// Si no hay carpeta abierta, lanzar launcher fullscreen
if (!vscode.workspace.workspaceFolders) {
  await vscode.commands.executeCommand('roscode.openLauncher');
}
```

### B2 — `LauncherPanel.ts`

Webview con `ViewColumn.One`, `retainContextWhenHidden: true`. Ocupa 100% del editor area.

**UI del launcher** — HTML/CSS/JS inline en el WebviewPanel. Diseño exacto:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  roscode  (wordmark top-left, 14px, #4cc9f0)        │
│                                                     │
│                                                     │
│         ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│         │    +     │ │   📁    │ │   🔗    │     │
│         │  Nuevo   │ │  Abrir  │ │  Clonar │     │
│         │ Proyecto │ │Proyecto │ │  Repo   │     │
│         └──────────┘ └──────────┘ └──────────┘     │
│                                                     │
│         Proyectos recientes                         │
│         ─────────────────────────────               │
│         roscode           ~/development  hace 2h   │
│         flutter_app       ~/development  ayer       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Especificaciones visuales exactas:
- Background: `#0d1117` (igual que GitHub dark)
- Cards: `border: 1px solid #21262d`, border-radius: `8px`, padding: `24px`
- Cards hover: `border-color: #4cc9f0`, `background: #161b22`
- Wordmark "roscode": Inter 600, `#4cc9f0`. "studio" en `#8b949e`
- Cards: ícono 24px arriba, texto 13px abajo, color `#e6edf3`
- Recent list: 12px, `#8b949e`, hover underline `#4cc9f0`
- **Cero sombras, cero gradientes, cero animaciones innecesarias**

### B3 — Comandos del launcher

- **Nuevo Proyecto** → abre `NewProjectWizard` (modal dentro del webview, no diálogo nativo)
- **Abrir Proyecto** → `vscode.window.showOpenDialog({ canSelectFolders: true })` → `vscode.commands.executeCommand('vscode.openFolder', uri)`
- **Clonar Repo** → input de URL → `git clone` via shell → abre carpeta

### B4 — New Project Wizard (modal dentro del launcher)

Modal que aparece sobre el launcher sin cerrar el webview:

**Paso 1**: Nombre del proyecto (input, validación: lowercase, sin espacios, ASCII)
**Paso 2**: Tipo de robot — 4 cards:
- 🚗 Diff Drive (non-holonomic)
- 🏎 Ackermann
- 🦾 Manipulator (6DOF)
- ⬜ Empty

**Paso 3**: Confirmación — muestra el árbol de archivos que se va a generar

Al confirmar, genera el workspace:
```
<nombre>/
├── .roscode/
│   └── config.json          # { "robotType": "diff-drive", "rosVersion": "2" }
├── src/
│   └── <nombre>/
│       ├── package.xml
│       ├── CMakeLists.txt
│       ├── <nombre>/
│       │   ├── __init__.py
│       │   └── <nombre>_node.py   # hello-world node
│       └── launch/
│           └── <nombre>.launch.py
└── README.md
```

Templates completos para **diff-drive** y **empty**. Ackermann y manipulator usan el mismo template de diff-drive con nombre diferente por ahora.

---

## Fase C — Studio Layout

**Goal**: Cuando se abre una carpeta con `.roscode/config.json` → fullscreen Studio que NO parece VS Code. El grafo ROS es el canvas principal. Paneles pinnables a los lados.

### C1 — Detección y activación

En `extension.ts`:
```typescript
// Cuando se abre workspace con .roscode/
vscode.workspace.onDidChangeWorkspaceFolders(checkForRoscodeProject);
async function checkForRoscodeProject() {
  const config = await vscode.workspace.findFiles('.roscode/config.json', null, 1);
  if (config.length > 0) {
    await vscode.commands.executeCommand('roscode.openStudio');
  }
}
```

### C2 — Layout del Studio

`StudioPanel.ts` — WebviewPanel fullscreen. Esta es la app completa. Todo ocurre aquí.

```
┌──────────────────────────────────────────────────────────────────┐
│ ◉ roscode studio        ●●● ROS: Offline        [▶ Start]  [⊞]  │  ← 40px top bar
├────────────┬─────────────────────────────────┬────────────────── ┤
│            │                                 │                   │
│  L-PANEL   │      ROS GRAPH CANVAS           │   R-PANEL         │
│  240px     │      Cytoscape.js               │   320px           │
│            │      fondo: #0d1117             │                   │
│  [📁][📦]  │      nodos: circles cyan/gray   │  [🤖][📡][🗺]    │
│            │      edges: líneas sutiles      │                   │
│  (tabs)    │                                 │  (tabs)           │
│            │      placeholder cuando         │                   │
│  FILES     │      ROS offline:               │  AGENT CHAT       │
│  ─────     │      "Robot offline · Start     │  ─────────        │
│  ...árbol  │       runtime to see graph"     │  ...chat          │
│  de files  │                                 │                   │
│            │                                 │                   │
│  LIBRARY   │                                 │  TOPIC MONITOR    │
│  ─────     │                                 │  ─────────        │
│  ...pkgs   │                                 │  ...topics        │
│            │                                 │                   │
│            │                                 │  CLAUDEMAP        │
│            │                                 │  ─────────        │
│            │                                 │  ...explain code  │
├────────────┴─────────────────────────────────┴───────────────────┤
│ [>_] Terminal / Logs                                    Cmd+`    │  ← bottom 32px
└──────────────────────────────────────────────────────────────────┘
```

### C3 — Top Bar

```html
<div class="top-bar">
  <!-- Izquierda -->
  <div class="wordmark">
    <span class="ros">roscode</span>
    <span class="studio">studio</span>
  </div>

  <!-- Centro -->
  <div class="status-pill" id="ros-status">
    <span class="dot offline"></span>
    <span>ROS: Offline</span>
  </div>

  <!-- Derecha -->
  <button id="btn-start" class="btn-primary">▶ Start Runtime</button>
  <button id="btn-tools" class="btn-ghost" title="Launch Tools">⊞</button>
  <button id="btn-editor" class="btn-ghost" title="Toggle Editor (Cmd+E)">{ }</button>
</div>
```

CSS del top bar:
- Background: `#010409` (más oscuro que el canvas)
- Border-bottom: `1px solid #21262d`
- `.ros`: color `#4cc9f0`, font-weight 600
- `.studio`: color `#8b949e`, font-weight 400
- Status pill offline: `background: #21262d`, dot gris
- Status pill online: `background: #0d2818`, dot `#3fb950` (verde)
- `btn-primary`: `background: #4cc9f0`, `color: #0d1117`, border-radius 6px
- `btn-ghost`: background transparent, border `#30363d`, color `#8b949e`

### C4 — Panel system (pinnable)

Implementar un mini panel-manager en el webview:
- Cada panel tiene un header con: ícono + nombre + botón collapse `[−]`
- Collapse: el panel se reduce a solo el header (no desaparece)
- El L-panel y R-panel son resizables arrastrando el borde
- Si el panel está colapsado en el lateral, se vuelve una tira de íconos vertical
- Estado se guarda en `vscode.ExtensionContext.globalState` (persiste entre sesiones)

### C5 — ROS Graph Canvas

Cytoscape.js en el centro:
- Fondo: `#0d1117`, sin grid visible
- Nodos (cuando hay ROS): círculos `#161b22`, borde `#30363d`, texto `#8b949e` 12px
- Nodos selected: borde `#4cc9f0`, glow suave
- Edges: `#21262d`, animados con dash cuando hay mensajes
- Cuando ROS offline: overlay semitransparente con mensaje y botón `▶ Start Runtime`
- Cuando ROS online: el overlay desaparece, el grafo renderiza la data real

### C6 — Editor toggle (Cmd+E)

El editor de código es un **tab extra** que aparece en el top bar cuando se activa:
- `[roscode studio] [Editor ×]` — click en "Editor ×" vuelve al studio
- Cuando está activo, el webview se oculta y Monaco toma el área completa
- Implementar con `vscode.commands.executeCommand('workbench.action.togglePanel')` + manejo de contexto

---

## Fase D — Package Library real

**Goal**: Panel izquierdo, tab "Library". Se siente como buscar extensiones en VS Code pero con identidad roscode. Paquetes REALES del ecosistema ROS 2 con repos de GitHub.

### D1 — Registry completo

Actualizar `packages/registry.json` con paquetes reales. Incluir todos los siguientes como mínimo:

```json
[
  {
    "id": "nav2",
    "name": "Nav2 Stack",
    "category": "Navigation",
    "description": "Complete navigation system for ROS 2. Path planning, costmaps, recovery behaviors, SLAM integration.",
    "repo": "https://github.com/ros-navigation/navigation2",
    "stars": 2400,
    "install": "sudo apt install ros-humble-navigation2",
    "tags": ["navigation", "slam", "planning"]
  },
  {
    "id": "moveit2",
    "name": "MoveIt 2",
    "category": "Manipulators",
    "description": "Motion planning for robotic arms. Supports 6DOF and 7DOF manipulators, collision avoidance, trajectory execution.",
    "repo": "https://github.com/moveit/moveit2",
    "stars": 1800,
    "install": "sudo apt install ros-humble-moveit",
    "tags": ["manipulation", "planning", "arm"]
  },
  {
    "id": "slam_toolbox",
    "name": "SLAM Toolbox",
    "category": "Navigation",
    "description": "2D SLAM for mobile robots. Lifelong mapping, localization, continuous SLAM.",
    "repo": "https://github.com/SteveMacenski/slam_toolbox",
    "stars": 1400,
    "install": "sudo apt install ros-humble-slam-toolbox",
    "tags": ["slam", "mapping", "localization"]
  },
  {
    "id": "ros2_control",
    "name": "ros2_control",
    "category": "Control",
    "description": "Real-time control framework. Hardware abstraction, controller manager, diff-drive, joint trajectory.",
    "repo": "https://github.com/ros-controls/ros2_control",
    "stars": 1100,
    "install": "sudo apt install ros-humble-ros2-control",
    "tags": ["control", "hardware", "real-time"]
  },
  {
    "id": "cartographer",
    "name": "Cartographer ROS",
    "category": "Navigation",
    "description": "Google's real-time SLAM. Supports 2D and 3D LIDAR, IMU fusion, loop closure.",
    "repo": "https://github.com/cartographer-project/cartographer_ros",
    "stars": 1300,
    "install": "sudo apt install ros-humble-cartographer-ros",
    "tags": ["slam", "lidar", "google"]
  },
  {
    "id": "micro_ros",
    "name": "micro-ROS",
    "category": "Embedded",
    "description": "ROS 2 for microcontrollers. Arduino, ESP32, STM32. Bridge to full ROS 2 ecosystem.",
    "repo": "https://github.com/micro-ROS/micro_ros_arduino",
    "stars": 1200,
    "install": "pip install micro-ros-agent",
    "tags": ["microcontroller", "arduino", "esp32", "embedded"]
  },
  {
    "id": "rosbridge",
    "name": "ROSBridge Suite",
    "category": "Utilities",
    "description": "WebSocket bridge between ROS and any client (browser, Unity, Python, etc.).",
    "repo": "https://github.com/RobotWebTools/rosbridge_suite",
    "stars": 800,
    "install": "sudo apt install ros-humble-rosbridge-suite",
    "tags": ["websocket", "bridge", "web"]
  },
  {
    "id": "gazebo_ros",
    "name": "Gazebo ROS2",
    "category": "Simulation",
    "description": "Gazebo integration for ROS 2. Physics simulation, sensor plugins, robot URDF loading.",
    "repo": "https://github.com/ros-simulation/gazebo_ros_pkgs",
    "stars": 900,
    "install": "sudo apt install ros-humble-gazebo-ros-pkgs",
    "tags": ["simulation", "physics", "gazebo"]
  },
  {
    "id": "foxglove_bridge",
    "name": "Foxglove Bridge",
    "category": "Visualization",
    "description": "WebSocket bridge to Foxglove Studio for real-time visualization of ROS data.",
    "repo": "https://github.com/foxglove/ros-foxglove-bridge",
    "stars": 500,
    "install": "sudo apt install ros-humble-foxglove-bridge",
    "tags": ["visualization", "foxglove", "websocket"]
  },
  {
    "id": "teleop_twist",
    "name": "Teleop Twist Keyboard",
    "category": "Utilities",
    "description": "Keyboard teleoperation for diff-drive and holonomic robots. Publishes Twist on /cmd_vel.",
    "repo": "https://github.com/ros-teleop/teleop_twist_keyboard",
    "stars": 400,
    "install": "sudo apt install ros-humble-teleop-twist-keyboard",
    "tags": ["teleop", "keyboard", "mobile"]
  },
  {
    "id": "tf2",
    "name": "TF2",
    "category": "Utilities",
    "description": "Transform library. Track coordinate frames over time, transform data between frames.",
    "repo": "https://github.com/ros2/geometry2",
    "stars": 350,
    "install": "sudo apt install ros-humble-tf2-ros",
    "tags": ["transforms", "frames", "geometry"]
  },
  {
    "id": "depth_image_proc",
    "name": "Depth Image Proc",
    "category": "Sensors",
    "description": "Processing for depth cameras (RealSense, Kinect). Point clouds, disparity, registered color.",
    "repo": "https://github.com/ros-perception/image_pipeline",
    "stars": 450,
    "install": "sudo apt install ros-humble-depth-image-proc",
    "tags": ["camera", "depth", "pointcloud", "realsense"]
  },
  {
    "id": "rplidar",
    "name": "RPLidar Driver",
    "category": "Sensors",
    "description": "Driver for Slamtec RPLidar A1/A2/A3/S1/S2. Publishes LaserScan on /scan.",
    "repo": "https://github.com/Slamtec/rplidar_ros",
    "stars": 700,
    "install": "sudo apt install ros-humble-rplidar-ros",
    "tags": ["lidar", "laser", "slamtec"]
  },
  {
    "id": "imu_tools",
    "name": "IMU Tools",
    "category": "Sensors",
    "description": "IMU data processing. Madgwick/Mahony filters, complementary filter, visualization.",
    "repo": "https://github.com/ccny-ros-pkg/imu_tools",
    "stars": 600,
    "install": "sudo apt install ros-humble-imu-tools",
    "tags": ["imu", "filter", "orientation"]
  },
  {
    "id": "robot_localization",
    "name": "Robot Localization",
    "category": "Navigation",
    "description": "EKF and UKF state estimation. Fuses odometry, IMU, GPS. Outputs /odom and /map transforms.",
    "repo": "https://github.com/cra-ros-pkg/robot_localization",
    "stars": 1000,
    "install": "sudo apt install ros-humble-robot-localization",
    "tags": ["ekf", "localization", "sensor-fusion"]
  },
  {
    "id": "behaviortree_cpp",
    "name": "BehaviorTree.CPP",
    "category": "Control",
    "description": "Behavior Trees for robotics. Used by Nav2. GUI editor Groot2 compatible.",
    "repo": "https://github.com/BehaviorTree/BehaviorTree.CPP",
    "stars": 2200,
    "install": "sudo apt install ros-humble-behaviortree-cpp-v3",
    "tags": ["behavior-tree", "nav2", "planning"]
  },
  {
    "id": "realsense2",
    "name": "Intel RealSense ROS2",
    "category": "Sensors",
    "description": "Official Intel RealSense driver for ROS 2. D435, D455, L515, T265 support.",
    "repo": "https://github.com/IntelRealSense/realsense-ros",
    "stars": 1500,
    "install": "sudo apt install ros-humble-realsense2-camera",
    "tags": ["realsense", "depth", "intel", "camera"]
  },
  {
    "id": "twist_mux",
    "name": "Twist Mux",
    "category": "Control",
    "description": "Multiplexer for Twist commands. Priority-based selection from teleop, navigation, safety override.",
    "repo": "https://github.com/ros-teleop/twist_mux",
    "stars": 200,
    "install": "sudo apt install ros-humble-twist-mux",
    "tags": ["control", "teleop", "mux"]
  },
  {
    "id": "joint_state_publisher",
    "name": "Joint State Publisher",
    "category": "Visualization",
    "description": "Publishes joint states from URDF. GUI slider for manual joint control. Essential for RViz.",
    "repo": "https://github.com/ros/joint_state_publisher",
    "stars": 300,
    "install": "sudo apt install ros-humble-joint-state-publisher-gui",
    "tags": ["urdf", "joints", "rviz", "visualization"]
  },
  {
    "id": "diagnostics",
    "name": "ROS 2 Diagnostics",
    "category": "Utilities",
    "description": "Hardware diagnostics framework. Monitor CPU, battery, hardware health. Aggregator and analyzer.",
    "repo": "https://github.com/ros/diagnostics",
    "stars": 250,
    "install": "sudo apt install ros-humble-diagnostics",
    "tags": ["diagnostics", "health", "monitoring"]
  }
]
```

### D2 — UI de la Library

Panel izquierdo, tab "Library". Diseño:

```
┌─────────────────────────────┐
│ 🔍 Search packages...   ✨  │  ← search + AI button
├─────────────────────────────┤
│ All  Nav  Ctrl  Sens  Sim   │  ← category chips (scroll)
│ Manip  Utils  Embed         │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ NAVIGATION              │ │  ← colored left border
│ │ Nav2 Stack         2.4k⭐│ │
│ │ Complete navigation...  │ │
│ │                [Install]│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ NAVIGATION              │ │
│ │ SLAM Toolbox       1.4k⭐│ │
│ │ 2D SLAM for mobile...   │ │
│ │                [Install]│ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Especificaciones:
- Cards: full width del panel, padding 12px, border-radius 6px
- Left border color por categoría:
  - Navigation: `#4cc9f0` (cyan)
  - Manipulators: `#a371f7` (purple)
  - Sensors: `#f78166` (orange)
  - Simulation: `#56d364` (green)
  - Control: `#e3b341` (yellow)
  - Utilities: `#8b949e` (gray)
  - Embedded: `#ffa657` (amber)
- Stars: número + ⭐, color `#8b949e`, font 11px
- Install button: `background: #21262d`, border `#30363d`, hover borde cyan
- Category chip activo: `background: #4cc9f0`, color `#0d1117`

### D3 — AI Search

Click en `✨` abre modal con textarea "Describe what you need...":
- Call a Anthropic API (`claude-sonnet-4-20250514`, max_tokens 1024)
- System prompt: "You are a ROS 2 expert. Given a description of what the user needs, suggest 3-5 ROS 2 packages with GitHub URLs. Return JSON array: [{name, description, repo, install_cmd}]"
- Resultados aparecen como cards con badge "AI Suggested" en magenta `#e040fb`
- Si falta `ANTHROPIC_API_KEY`: mensaje "Add ANTHROPIC_API_KEY to your env to use AI search"

### D4 — Install button

Para MVP: toast "📋 Copied install command" + copia al clipboard el `apt install ...`. El install real (dentro del container Docker) es post-MVP.

---

## Fase E — claudemap integration

**Goal**: Panel derecho, tab "Explain". Explica el código del archivo actualmente abierto dividido por secciones semánticas. Basado en el concepto de [claudemap](https://github.com/anthropics/claude-code) — explicar código por bloques con Claude.

### E1 — ClaudemapPanel en el webview

Tab "🗺 Map" en el R-PANEL. Se activa cuando hay un archivo abierto en el editor.

```
┌────────────────────────────┐
│ 🗺 Code Map                │
│ current: odometry_node.py  │  ← nombre del archivo activo
├────────────────────────────┤
│ ▼ Imports (lines 1-8)      │  ← sección colapsable
│   "Imports ROS, rclpy,     │
│    OccupancyGrid for map   │
│    representation"         │
├────────────────────────────┤
│ ▼ OdometryNode class       │  ← sección
│   lines 10-45              │
│   "Main node class.        │
│    Subscribes to /imu and  │
│    /wheel_encoder, fuses   │
│    data, publishes /odom"  │
├────────────────────────────┤
│ ▼ __init__ (lines 10-22)   │
│   "Initializes publishers, │
│    subscribers, sets       │
│    yaw_bias correction"    │
└────────────────────────────┘
```

### E2 — Implementación

En `AgentView.ts` o en un nuevo `ClaudemapProvider.ts`:

```typescript
// Escuchar cambios de archivo activo
vscode.window.onDidChangeActiveTextEditor(async (editor) => {
  if (!editor) return;
  const code = editor.document.getText();
  const filename = editor.document.fileName.split('/').pop();
  
  // Llamar a Anthropic API para generar el mapa
  const sections = await generateCodeMap(code, filename);
  panel.webview.postMessage({ type: 'codemap', sections });
});

async function generateCodeMap(code: string, filename: string) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Analyze this ROS 2 file and return a JSON array of code sections.
Each section: { "name": string, "lines": [start, end], "summary": string (1-2 sentences) }
Focus on: imports, class definitions, __init__, key methods, ROS callbacks.
File: ${filename}

\`\`\`python
${code.slice(0, 4000)}
\`\`\``
    }]
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = text.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}
```

### E3 — Click en sección

Cuando el usuario hace click en una sección del claudemap:
- Se abre el editor (si no estaba visible)
- El cursor salta a esa línea
- Las líneas de la sección se resaltan brevemente

---

## Fase F — External Tools Launcher

**Goal**: Botón `⊞` en top bar. Dropdown para lanzar herramientas externas que abren en ventana separada o en browser.

### F1 — Dropdown "Launch Tools"

```
⊞  Launch Tools
   ┌──────────────────────────────┐
   │ 🔵  RViz2                    │  → docker run + abre ventana X11/XQuartz
   │ 🦊  Foxglove Studio          │  → abre foxglove.dev en browser
   │ 📊  rqt_graph                │  → docker exec rqt_graph
   │ 📈  PlotJuggler              │  → docker run plotjuggler
   │ 🖥  ROS Terminal             │  → xterm.js flotante con bash del container
   └──────────────────────────────┘
```

### F2 — Implementación

Comandos que ejecuta cada opción:

```typescript
// RViz2
'docker exec -it ros bash -c "source /opt/ros/humble/setup.bash && rviz2"'

// Foxglove
vscode.env.openExternal(vscode.Uri.parse('https://app.foxglove.dev'))

// rqt_graph
'docker exec -it ros bash -c "source /opt/ros/humble/setup.bash && rqt_graph"'

// ROS Terminal — abre xterm.js flotante via webview separado
vscode.commands.executeCommand('roscode.openTerminal')
```

### F3 — Terminal flotante

Panel adicional `TerminalView.ts` — xterm.js conectado a:
- Si runtime online: `docker exec -it ros bash`
- Si runtime offline: bash local con ROS sourced

Abre como WebviewPanel en columna separada (ViewColumn.Beside).

---

## Fase G — Wiring final de ROS tools

**Goal**: Conectar todo el studio con los datos reales de ROS del agente Python.

### G1 — Agent Chat

`AgentView.ts` ya funciona con el Anthropic SDK. Verificar que:
- Tools confirmadas/rechazadas muestran el card visual correcto
- Streaming de tokens funciona fluido
- Los 8 tools actuales funcionan en el nuevo layout

### G2 — Topic Monitor

Cuando ROS online, el tab "📡 Topics" muestra:
- Lista de topics activos con tipo de mensaje
- Click en topic → inicia echo en panel inline
- Data en tiempo real (polling via `ros2 topic echo --once` cada 2s)

### G3 — Runtime Start/Stop

Botón `▶ Start Runtime` del top bar:
- Ejecuta `docker compose up -d` desde `runtime/docker-compose.yml` del workspace (o del repo)
- Status pill cambia: gris → amarillo "Starting..." → verde "ROS: Online"
- Cuando online: el grafo de Cytoscape llama a `ros_graph()` via el agente y renderiza nodos reales

---

## Scripts de apoyo

### `scripts/dev.sh`

Para desarrollo rápido sin rebuild completo:
```bash
#!/usr/bin/env bash
# Rebuild solo la extensión y re-patchear el bundle
cd roscode-extension && pnpm run package --silent
cd ..
./scripts/patch-bundle.sh
open "roscode-studio-build/roscode studio.app"
```

### `scripts/clean.sh`

```bash
rm -rf vscodium-build/work roscode-studio-build/roscode\ studio.app
echo "✅ Cleaned"
```

---

## Orden de ejecución estricto para hoy

```
Fase A  → patch-bundle.sh + CSS nuclear              ~30 min
           ↓ verificar: .app abre sin chrome de VS Code
Fase C  → Studio layout shell (datos placeholder)    ~3 hr
           ↓ verificar: top bar + 3 áreas + graph canvas + paneles pinnables
Fase B  → Launcher Cursor-style + New Project wizard ~2 hr
           ↓ verificar: launcher aparece sin carpeta, wizard genera workspace
Fase D  → Package library (20 paquetes reales + AI)  ~1.5 hr
           ↓ verificar: search, filtros, AI search con key
Fase E  → claudemap panel                            ~1 hr
           ↓ verificar: abre archivo → secciones aparecen
Fase F  → Launch Tools dropdown                      ~45 min
           ↓ verificar: foxglove abre, terminal flotante funciona
Fase G  → Wiring ROS real                            ~1 hr
           ↓ verificar: agent chat, topic monitor, runtime toggle
```

Total estimado: ~10 horas. Si el tiempo aprieta, parar en Fase D — el studio con library real ya es demo-able.

---

## Checkpoint template (usar después de cada fase)

```
✅ Construí: ...
⏭ Salté: ... porque ...
🤔 Decidí por mi cuenta: ...
👁 Descripción visual actual: ...

¿Procedo con Fase X?
```
