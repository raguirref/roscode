"""Static code analysis tools: workspace_map and code_search.

No ROS runtime required — all analysis is done on source files via Python AST
and regex. These tools give Claude an instant architectural understanding of the
workspace without having to read every file individually.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Any

from roscode.tools._state import get_workspace


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------

def _safe_unparse(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return "?"


def _const_str(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _safe_literal(node: ast.AST) -> object:
    try:
        return ast.literal_eval(node)
    except Exception:
        return _safe_unparse(node)


# ---------------------------------------------------------------------------
# Per-file analysis
# ---------------------------------------------------------------------------

def _analyze_file(path: Path) -> dict:
    """Extract ROS 2 structure from a Python source file via AST.

    Returns a dict with keys: node_classes, publishers, subscribers,
    services, parameters, timers (Hz).
    """
    try:
        source = path.read_text(errors="replace")
        tree = ast.parse(source, filename=str(path))
    except (SyntaxError, OSError):
        return {}

    info: dict = {
        "node_classes": [],
        "publishers":   [],   # (topic, msg_type_short)
        "subscribers":  [],   # (topic, msg_type_short)
        "services":     [],   # (name, srv_type_short)
        "parameters":   [],   # (name, default_repr)
        "timer_hz":     [],   # float Hz values
    }

    # Node subclasses
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            bases = [_safe_unparse(b) for b in node.bases]
            if any("Node" in b for b in bases):
                info["node_classes"].append(node.name)

    # Call-site patterns
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue

        if isinstance(node.func, ast.Attribute):
            fn = node.func.attr
        elif isinstance(node.func, ast.Name):
            fn = node.func.id
        else:
            continue

        args = node.args

        if fn == "create_publisher" and len(args) >= 2:
            info["publishers"].append((
                _const_str(args[1]) or "<dynamic>",
                _safe_unparse(args[0]).split(".")[-1],
            ))

        elif fn == "create_subscription" and len(args) >= 2:
            info["subscribers"].append((
                _const_str(args[1]) or "<dynamic>",
                _safe_unparse(args[0]).split(".")[-1],
            ))

        elif fn == "create_service" and len(args) >= 2:
            info["services"].append((
                _const_str(args[1]) or "<dynamic>",
                _safe_unparse(args[0]).split(".")[-1],
            ))

        elif fn == "declare_parameter" and len(args) >= 1:
            name = _const_str(args[0]) or "<dynamic>"
            default = _safe_literal(args[1]) if len(args) > 1 else None
            info["parameters"].append((name, default))

        elif fn == "create_timer" and len(args) >= 1:
            try:
                period = float(ast.literal_eval(args[0]))
                if 0 < period <= 100:
                    info["timer_hz"].append(round(1.0 / period, 1))
            except Exception:
                pass

    return info


# ---------------------------------------------------------------------------
# Package-level helpers
# ---------------------------------------------------------------------------

def _pkg_deps(package_xml: Path) -> list[str]:
    """Extract non-ament runtime dependencies from package.xml."""
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(package_xml.read_text(errors="replace"))
        seen: set[str] = set()
        deps: list[str] = []
        for tag in ("depend", "exec_depend"):
            for el in root.findall(tag):
                if el.text:
                    name = el.text.strip()
                    if name not in seen and not name.startswith("ament_"):
                        seen.add(name)
                        deps.append(name)
        return sorted(deps)
    except Exception:
        return []


# ---------------------------------------------------------------------------
# workspace_map
# ---------------------------------------------------------------------------

def workspace_map() -> str:
    """Build a full semantic map of the workspace: packages, nodes, topics, params.

    Uses AST analysis — no ROS runtime needed. Call this at the start of any
    session to understand the codebase before touching files or running tools.
    """
    workspace = get_workspace()
    src = workspace / "src"
    if not src.exists():
        return f"Error: No src/ directory under {workspace}"

    packages = sorted(p for p in src.iterdir() if p.is_dir())
    if not packages:
        return "Workspace src/ is empty — no packages found."

    # ── Pass 1: collect per-file analysis ────────────────────────────────
    pkg_data: dict[str, dict] = {}
    for pkg_dir in packages:
        deps = _pkg_deps(pkg_dir / "package.xml") if (pkg_dir / "package.xml").exists() else []
        files: dict[str, dict] = {}

        for py_file in sorted(pkg_dir.rglob("*.py")):
            # Skip __init__, setup, and test files
            if py_file.name in ("__init__.py", "setup.py") or "test" in py_file.parts:
                continue
            analysis = _analyze_file(py_file)
            if any(analysis.values()):
                rel = py_file.relative_to(workspace).as_posix()
                files[rel] = analysis

        pkg_data[pkg_dir.name] = {"deps": deps, "files": files}

    # ── Pass 2: build cross-package topic graph ───────────────────────────
    # topic → {"pubs": [NodeClass, ...], "subs": [NodeClass, ...]}
    topic_graph: dict[str, dict[str, list[str]]] = {}

    for pkg_name, data in pkg_data.items():
        for file_rel, analysis in data["files"].items():
            label = analysis["node_classes"][0] if analysis["node_classes"] else Path(file_rel).stem
            for topic, _ in analysis["publishers"]:
                tg = topic_graph.setdefault(topic, {"pubs": [], "subs": []})
                if label not in tg["pubs"]:
                    tg["pubs"].append(label)
            for topic, _ in analysis["subscribers"]:
                tg = topic_graph.setdefault(topic, {"pubs": [], "subs": []})
                if label not in tg["subs"]:
                    tg["subs"].append(label)

    # ── Pass 3: render ────────────────────────────────────────────────────
    total_nodes = sum(
        len(a["node_classes"])
        for d in pkg_data.values()
        for a in d["files"].values()
    )
    lines: list[str] = [
        f"WORKSPACE MAP  ─  {src.as_posix()}",
        f"  {len(packages)} package(s)  ·  {total_nodes} ROS node(s)  ·  {len(topic_graph)} topic(s)\n",
    ]

    sep = "─" * 68

    for pkg_name, data in pkg_data.items():
        lines.append(sep)
        meaningful_deps = [d for d in data["deps"] if d != "rclpy"]
        dep_str = f"  deps: {', '.join(meaningful_deps)}" if meaningful_deps else ""
        lines.append(f"  {pkg_name}{dep_str}")
        lines.append("")

        files = data["files"]
        if not files:
            lines.append("    (no annotated Python nodes found)")
            lines.append("")
            continue

        for file_rel, a in files.items():
            fname = Path(file_rel).name
            node_classes = ", ".join(a["node_classes"]) or "(no Node subclass)"
            hz_str = ""
            if a["timer_hz"]:
                hz_str = "  @ " + ", ".join(f"{h} Hz" for h in sorted(set(a["timer_hz"])))
            lines.append(f"    {fname} :: {node_classes}{hz_str}")

            for topic, msg_type in a["publishers"]:
                lines.append(f"      pub   {topic:<36} [{msg_type}]")
            for topic, msg_type in a["subscribers"]:
                lines.append(f"      sub   {topic:<36} [{msg_type}]")
            for svc, srv_type in a["services"]:
                lines.append(f"      srv   {svc:<36} [{srv_type}]")
            for pname, default in a["parameters"]:
                dstr = f"  =  {default!r}" if default is not None else ""
                lines.append(f"      param {pname}{dstr}")
            lines.append("")

    # ── Topic graph ───────────────────────────────────────────────────────
    if topic_graph:
        lines.append(sep)
        lines.append("  DATA FLOW GRAPH  (source code connections)\n")
        for topic in sorted(topic_graph):
            tg = topic_graph[topic]
            pubs = " + ".join(tg["pubs"]) if tg["pubs"] else "(external)"
            subs = " + ".join(tg["subs"]) if tg["subs"] else "∅ (no subscriber in workspace)"
            lines.append(f"    {topic}")
            lines.append(f"      {pubs}  ──▶  {subs}")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# code_search
# ---------------------------------------------------------------------------

_SEARCH_PATTERNS: dict[str, str] = {
    "publisher":   r"create_publisher\s*\(",
    "subscriber":  r"create_subscription\s*\(",
    "service":     r"create_service\s*\(",
    "parameter":   r"declare_parameter\s*\(",
    "import":      r"^(?:import|from)\s+",
    "any":         r"",   # handled separately
}


def code_search(query: str, search_type: str = "any") -> str:
    """Search source files for ROS patterns or free text.

    search_type: publisher | subscriber | service | parameter | import | any
    """
    workspace = get_workspace()
    src = workspace / "src"
    if not src.exists():
        return f"Error: No src/ directory under {workspace}"

    q_pattern = re.escape(query)

    if search_type in _SEARCH_PATTERNS and search_type != "any":
        # Require both the ROS call pattern AND the query on the same line
        line_pat = re.compile(_SEARCH_PATTERNS[search_type] + r".*" + q_pattern, re.IGNORECASE)
    else:
        line_pat = re.compile(q_pattern, re.IGNORECASE)

    results: list[str] = []
    for py_file in sorted(src.rglob("*.py")):
        if "test" in py_file.parts:
            continue
        try:
            text_lines = py_file.read_text(errors="replace").splitlines()
        except OSError:
            continue
        rel = py_file.relative_to(workspace).as_posix()
        for lineno, line in enumerate(text_lines, 1):
            if line_pat.search(line):
                results.append(f"  {rel}:{lineno}  {line.strip()}")

    if not results:
        scope = f"type={search_type!r}" if search_type != "any" else "free text"
        return f"No matches for {query!r} ({scope}) in workspace/src."

    header = f"Found {len(results)} match(es) for {query!r}  (type={search_type}):"
    body = "\n".join(results[:60])
    tail = f"\n  … ({len(results) - 60} more)" if len(results) > 60 else ""
    return f"{header}\n{body}{tail}"


# ---------------------------------------------------------------------------
# Schemas + TOOLS
# ---------------------------------------------------------------------------

SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "workspace_map",
        "description": (
            "Build a full semantic map of the ROS 2 workspace using static code analysis "
            "(no runtime needed). Returns every package, node class, publisher, subscriber, "
            "service, and parameter found in the source code, plus a cross-package DATA FLOW "
            "GRAPH showing which nodes are connected via topics. "
            "Call this at the start of any session — it replaces multiple read_source_file "
            "calls and gives you the full architecture at a glance."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "code_search",
        "description": (
            "Search the workspace source files for a keyword or ROS pattern. "
            "search_type='publisher' finds create_publisher calls containing the query; "
            "'subscriber' finds create_subscription; 'parameter' finds declare_parameter; "
            "'service' finds create_service; 'import' finds import lines; "
            "'any' (default) is a free-text search. "
            "Use this to locate where a specific topic, message type, or parameter is used."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword or fragment to search for, e.g. '/odom', 'yaw_bias', 'LaserScan'.",
                },
                "search_type": {
                    "type": "string",
                    "enum": ["publisher", "subscriber", "service", "parameter", "import", "any"],
                    "description": "Category to restrict the search. Default 'any'.",
                    "default": "any",
                },
            },
            "required": ["query"],
        },
    },
]

TOOLS = {
    "workspace_map": workspace_map,
    "code_search":   code_search,
}
