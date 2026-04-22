"""Package discovery tools: search and inspect ROS 2 packages.

These tools are read-only — no confirmation gate needed.
They work both in native ROS installs and inside the managed container.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from roscode.tools import _shell


def pkg_search(query: str) -> str:
    """Search installed and available ROS 2 packages matching query."""
    installed_result = _shell.run(["ros2", "pkg", "list"], timeout=10.0)

    all_installed: set[str] = set()
    if installed_result.ok:
        all_installed = {p.strip() for p in installed_result.stdout.splitlines() if p.strip()}

    installed_matches = sorted(p for p in all_installed if query.lower() in p.lower())

    # apt-cache search for packages not yet installed
    apt_query = query.lower().replace("_", "-").replace(" ", "-")
    apt_result = _shell.run(
        ["apt-cache", "search", f"ros-humble.*{apt_query}"],
        timeout=10.0,
    )

    available: list[str] = []
    if apt_result.ok:
        for line in apt_result.stdout.splitlines():
            if not line.strip():
                continue
            pkg_part = line.split(" - ")[0].strip()
            ros_name = pkg_part.replace("ros-humble-", "").replace("-", "_")
            if ros_name not in all_installed:
                desc = line.split(" - ", 1)[1].strip() if " - " in line else ""
                available.append(f"  {ros_name:<40} ({pkg_part})" + (f"  — {desc[:60]}" if desc else ""))

    lines: list[str] = []
    if installed_matches:
        lines.append(f"Installed ({len(installed_matches)}):")
        lines.extend(f"  {p}" for p in installed_matches)
    else:
        lines.append(f"No installed packages matching {query!r}.")

    if available:
        lines.append(f"\nAvailable to install ({len(available)}):")
        lines.extend(available[:25])
        if len(available) > 25:
            lines.append(f"  … and {len(available) - 25} more.")
        lines.append(f"\nInstall any with: apt-get install -y ros-humble-<name>")

    return "\n".join(lines) if lines else f"No packages found matching {query!r}."


def pkg_info(package_name: str) -> str:
    """Return metadata for a ROS 2 package (installed or available via apt)."""
    result = _shell.run(["ros2", "pkg", "xml", package_name], timeout=5.0)

    if not result.ok:
        deb_name = "ros-humble-" + package_name.replace("_", "-")
        apt = _shell.run(["apt-cache", "show", deb_name], timeout=5.0)
        if apt.ok and apt.stdout.strip():
            keep = ("Package:", "Version:", "Description:", "Homepage:")
            lines = [ln for ln in apt.stdout.splitlines() if any(ln.startswith(k) for k in keep)]
            if lines:
                return "\n".join(lines) + f"\n\nNot installed. Install: apt-get install -y {deb_name}"
        return f"Package {package_name!r} not found (not installed, not in apt)."

    try:
        root = ET.fromstring(result.stdout)
        desc = (root.findtext("description") or "").strip()
        version = (root.findtext("version") or "unknown").strip()
        all_deps = sorted({
            d.text.strip()
            for tag in ("depend", "exec_depend", "build_depend")
            for d in root.findall(tag)
            if d.text
        })
        parts = [
            f"Package:      {package_name}",
            f"Version:      {version}",
            f"Description:  {desc}",
        ]
        if all_deps:
            parts.append(f"Dependencies: {', '.join(all_deps)}")
        return "\n".join(parts)
    except ET.ParseError:
        return result.stdout.strip()


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "pkg_search",
        "description": (
            "Search for ROS 2 packages by name or keyword. Returns installed matches "
            "and packages available to install via apt. Use this to discover message "
            "types, sensor drivers, navigation stacks, or any ROS package by name. "
            "Examples: 'nav2', 'slam', 'lidar', 'twist', 'rviz'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword to search in package names, e.g. 'nav2', 'lidar', 'slam'.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "pkg_info",
        "description": (
            "Return the version, description, and dependencies of a specific ROS 2 package. "
            "Use this before adding a dependency to package.xml to confirm the package "
            "name, what it provides, and what it requires."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "package_name": {
                    "type": "string",
                    "description": "Exact package name, e.g. 'sensor_msgs', 'nav2_bringup'.",
                },
            },
            "required": ["package_name"],
        },
    },
]

TOOLS = {
    "pkg_search": pkg_search,
    "pkg_info": pkg_info,
}
