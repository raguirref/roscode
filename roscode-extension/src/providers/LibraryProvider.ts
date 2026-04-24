import * as vscode from "vscode";

interface MessageDef {
  name: string;
  fields: string[]; // "type name"
  description?: string;
}

interface Package {
  name: string;
  kind: "messages" | "services" | "actions";
  messages: MessageDef[];
}

// Curated subset of the most common ROS 2 message packages.
// Enough for the agent and users to reference without a live connection.
const LIBRARY: Package[] = [
  {
    name: "std_msgs",
    kind: "messages",
    messages: [
      { name: "Bool",        fields: ["bool data"] },
      { name: "Int32",       fields: ["int32 data"] },
      { name: "Float64",     fields: ["float64 data"] },
      { name: "String",      fields: ["string data"] },
      { name: "Header",      fields: ["uint32 seq", "builtin_interfaces/Time stamp", "string frame_id"] },
      { name: "ColorRGBA",   fields: ["float32 r", "float32 g", "float32 b", "float32 a"] },
      { name: "Empty",       fields: [] },
    ],
  },
  {
    name: "geometry_msgs",
    kind: "messages",
    messages: [
      { name: "Point",       fields: ["float64 x", "float64 y", "float64 z"] },
      { name: "Quaternion",  fields: ["float64 x", "float64 y", "float64 z", "float64 w"] },
      { name: "Vector3",     fields: ["float64 x", "float64 y", "float64 z"] },
      { name: "Pose",        fields: ["Point position", "Quaternion orientation"] },
      { name: "PoseStamped", fields: ["std_msgs/Header header", "Pose pose"] },
      { name: "Twist",       fields: ["Vector3 linear", "Vector3 angular"] },
      { name: "TwistStamped", fields: ["std_msgs/Header header", "Twist twist"] },
      { name: "Transform",   fields: ["Vector3 translation", "Quaternion rotation"] },
      { name: "TransformStamped", fields: ["std_msgs/Header header", "string child_frame_id", "Transform transform"] },
      { name: "Wrench",      fields: ["Vector3 force", "Vector3 torque"] },
      { name: "Accel",       fields: ["Vector3 linear", "Vector3 angular"] },
    ],
  },
  {
    name: "sensor_msgs",
    kind: "messages",
    messages: [
      { name: "Imu",           fields: ["std_msgs/Header header", "Quaternion orientation", "float64[9] orientation_covariance", "Vector3 angular_velocity", "float64[9] angular_velocity_covariance", "Vector3 linear_acceleration", "float64[9] linear_acceleration_covariance"] },
      { name: "LaserScan",     fields: ["std_msgs/Header header", "float32 angle_min", "float32 angle_max", "float32 angle_increment", "float32 time_increment", "float32 scan_time", "float32 range_min", "float32 range_max", "float32[] ranges", "float32[] intensities"] },
      { name: "PointCloud2",   fields: ["std_msgs/Header header", "uint32 height", "uint32 width", "PointField[] fields", "bool is_bigendian", "uint32 point_step", "uint32 row_step", "uint8[] data", "bool is_dense"] },
      { name: "Image",         fields: ["std_msgs/Header header", "uint32 height", "uint32 width", "string encoding", "uint8 is_bigendian", "uint32 step", "uint8[] data"] },
      { name: "CameraInfo",    fields: ["std_msgs/Header header", "uint32 height", "uint32 width", "string distortion_model", "float64[] d", "float64[9] k", "float64[9] r", "float64[12] p"] },
      { name: "JointState",    fields: ["std_msgs/Header header", "string[] name", "float64[] position", "float64[] velocity", "float64[] effort"] },
      { name: "NavSatFix",     fields: ["std_msgs/Header header", "NavSatStatus status", "float64 latitude", "float64 longitude", "float64 altitude"] },
      { name: "BatteryState",  fields: ["std_msgs/Header header", "float32 voltage", "float32 current", "float32 charge", "float32 capacity", "float32 percentage"] },
      { name: "Range",         fields: ["std_msgs/Header header", "uint8 radiation_type", "float32 field_of_view", "float32 min_range", "float32 max_range", "float32 range"] },
    ],
  },
  {
    name: "nav_msgs",
    kind: "messages",
    messages: [
      { name: "Odometry",      fields: ["std_msgs/Header header", "string child_frame_id", "geometry_msgs/PoseWithCovariance pose", "geometry_msgs/TwistWithCovariance twist"] },
      { name: "Path",          fields: ["std_msgs/Header header", "geometry_msgs/PoseStamped[] poses"] },
      { name: "OccupancyGrid", fields: ["std_msgs/Header header", "MapMetaData info", "int8[] data"] },
      { name: "MapMetaData",   fields: ["builtin_interfaces/Time map_load_time", "float32 resolution", "uint32 width", "uint32 height", "geometry_msgs/Pose origin"] },
      { name: "GridCells",     fields: ["std_msgs/Header header", "float32 cell_width", "float32 cell_height", "geometry_msgs/Point[] cells"] },
    ],
  },
  {
    name: "tf2_msgs",
    kind: "messages",
    messages: [
      { name: "TFMessage", fields: ["geometry_msgs/TransformStamped[] transforms"] },
    ],
  },
  {
    name: "visualization_msgs",
    kind: "messages",
    messages: [
      { name: "Marker",      fields: ["std_msgs/Header header", "string ns", "int32 id", "int32 type", "int32 action", "geometry_msgs/Pose pose", "geometry_msgs/Vector3 scale", "std_msgs/ColorRGBA color", "builtin_interfaces/Duration lifetime"] },
      { name: "MarkerArray", fields: ["Marker[] markers"] },
    ],
  },
  {
    name: "action_msgs",
    kind: "actions",
    messages: [
      { name: "GoalInfo",   fields: ["unique_identifier_msgs/UUID goal_id", "builtin_interfaces/Time stamp"] },
      { name: "GoalStatus", fields: ["GoalInfo goal_info", "int8 status"] },
    ],
  },
  {
    name: "std_srvs",
    kind: "services",
    messages: [
      { name: "Empty",    fields: ["---"] },
      { name: "Trigger",  fields: ["---", "bool success", "string message"] },
      { name: "SetBool",  fields: ["bool data", "---", "bool success", "string message"] },
    ],
  },
];

export class LibraryProvider implements vscode.TreeDataProvider<LibItem> {
  private _onChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onChange.event;
  private _filter = "";

  getTreeItem(el: LibItem): vscode.TreeItem { return el; }

  getChildren(el?: LibItem): LibItem[] {
    if (!el) {
      // Top-level: packages
      return LIBRARY
        .filter((p) => !this._filter || p.messages.some((m) => this._match(m.name, p.name)))
        .map((p) => new PackageItem(p));
    }
    if (el instanceof PackageItem) {
      return el.pkg.messages
        .filter((m) => !this._filter || this._match(m.name, el.pkg.name))
        .map((m) => new MessageItem(m, el.pkg));
    }
    if (el instanceof MessageItem) {
      return el.msg.fields.map((f) => new FieldItem(f));
    }
    return [];
  }

  private _match(name: string, pkg: string): boolean {
    const q = this._filter.toLowerCase();
    return name.toLowerCase().includes(q) || pkg.toLowerCase().includes(q) || `${pkg}/${name}`.toLowerCase().includes(q);
  }

  async search(): Promise<void> {
    const all: { label: string; description: string; pkg: string; msg: string }[] = [];
    for (const p of LIBRARY) {
      for (const m of p.messages) {
        all.push({
          label: m.name,
          description: p.name,
          pkg: p.name,
          msg: m.name,
        });
      }
    }
    const pick = await vscode.window.showQuickPick(all, {
      placeHolder: "Search ROS message types…",
      matchOnDescription: true,
    });
    if (pick) {
      this._filter = `${pick.pkg}/${pick.msg}`;
      this._onChange.fire();
    }
  }

  clearFilter(): void { this._filter = ""; this._onChange.fire(); }
}

type LibItem = PackageItem | MessageItem | FieldItem;

class PackageItem extends vscode.TreeItem {
  readonly pkg: Package;
  constructor(pkg: Package) {
    super(pkg.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.pkg = pkg;
    this.iconPath = new vscode.ThemeIcon(
      pkg.kind === "services" ? "symbol-method"
        : pkg.kind === "actions" ? "symbol-event"
        : "package"
    );
    this.description = `${pkg.messages.length} ${pkg.kind}`;
    this.tooltip = `${pkg.name} — ${pkg.kind}`;
    this.contextValue = "library-package";
  }
}

class MessageItem extends vscode.TreeItem {
  readonly msg: MessageDef;
  readonly pkg: Package;
  constructor(msg: MessageDef, pkg: Package) {
    super(msg.name, msg.fields.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.msg = msg;
    this.pkg = pkg;
    this.iconPath = new vscode.ThemeIcon("symbol-struct", new vscode.ThemeColor("charts.blue"));
    this.description = `${msg.fields.length} field${msg.fields.length === 1 ? "" : "s"}`;
    this.tooltip = new vscode.MarkdownString(
      `**${pkg.name}/${msg.name}**\n\n\`\`\`\n${msg.fields.join("\n") || "(empty)"}\n\`\`\``
    );
    this.contextValue = "library-message";
    this.command = {
      command: "roscode.insertMessageType",
      title: "Insert",
      arguments: [`${pkg.name}/${msg.name}`],
    };
  }
}

class FieldItem extends vscode.TreeItem {
  constructor(field: string) {
    super(field, vscode.TreeItemCollapsibleState.None);
    const [type, name] = field.split(/\s+/, 2);
    this.label = name ? `${name}` : field;
    this.description = type;
    this.iconPath = new vscode.ThemeIcon("symbol-field", new vscode.ThemeColor("charts.purple"));
    this.tooltip = field;
  }
}
