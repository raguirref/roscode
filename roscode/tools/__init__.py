"""roscode tool surface exposed to the Anthropic agent.

TOOL_DEFINITIONS is the JSON-schema list passed to `messages.create(tools=…)`.
TOOL_MAP routes Anthropic tool-use blocks back to Python callables.

Tool modules each export:
  * SCHEMAS — list of Anthropic tool definition dicts
  * TOOLS   — dict mapping tool name -> callable returning str
"""

from __future__ import annotations

from typing import Any, Callable

from roscode.tools import (
    analysis_tools,
    build_tools,
    fs_tools,
    gui_tools,
    pkg_tools,
    ros_tools,
    runtime_tools,
)
from roscode.tools._state import get_workspace, set_workspace

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    *analysis_tools.SCHEMAS,  # workspace_map + code_search — put first so Opus sees them early
    *ros_tools.SCHEMAS,
    *fs_tools.SCHEMAS,
    *build_tools.SCHEMAS,
    *pkg_tools.SCHEMAS,
    *gui_tools.SCHEMAS,
    *runtime_tools.SCHEMAS,   # active control: publish, sample, analyze, tune
]

TOOL_MAP: dict[str, Callable[..., str]] = {
    **analysis_tools.TOOLS,
    **ros_tools.TOOLS,
    **fs_tools.TOOLS,
    **build_tools.TOOLS,
    **pkg_tools.TOOLS,
    **gui_tools.TOOLS,
    **runtime_tools.TOOLS,
}

__all__ = ["TOOL_DEFINITIONS", "TOOL_MAP", "set_workspace", "get_workspace"]
