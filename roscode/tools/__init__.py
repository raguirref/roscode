"""roscode tool surface exposed to the Anthropic agent.

TOOL_DEFINITIONS is the JSON-schema list passed to `messages.create(tools=…)`.
TOOL_MAP routes Anthropic tool-use blocks back to Python callables.

Tool modules (ros_tools, fs_tools, build_tools) are scaffolded in Task 6 and
will register their entries here via extend/update.
"""

from __future__ import annotations

from typing import Any, Callable

TOOL_DEFINITIONS: list[dict[str, Any]] = []
TOOL_MAP: dict[str, Callable[..., str]] = {}
