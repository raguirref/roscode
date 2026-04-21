"""Rich-based terminal UI for roscode."""

from __future__ import annotations

import difflib
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.syntax import Syntax

_console = Console()


def print_status(text: str) -> None:
    """Print an informational status line (container startup, etc.)."""
    _console.print(f"[dim]▸ {text}[/dim]")


def print_agent_message(text: str) -> None:
    _console.print(f"[bold cyan]🤖[/bold cyan]  {text}")


def print_tool_call(name: str, args: dict[str, Any]) -> None:
    args_block = "\n".join(f"  {k}: {_fmt_arg(v)}" for k, v in args.items()) or "  (no args)"
    _console.print(
        Panel.fit(
            args_block,
            title=f"🔧 {name}",
            border_style="blue",
        )
    )


def print_tool_result(name: str, result: Any) -> None:
    body = str(result)
    # Truncate very long results so the terminal stays readable; the full
    # result still goes back to the model via the conversation.
    if body.count("\n") > 60:
        lines = body.splitlines()
        body = "\n".join(lines[:30] + ["  …", f"  ({len(lines) - 40} lines elided)", "  …"] + lines[-10:])
    _console.print(
        Panel.fit(
            body,
            title=f"✅ {name} result",
            border_style="green",
        )
    )


def confirm_action(name: str, args: dict[str, Any]) -> bool:
    if name == "write_source_file":
        _render_write_preview(args)

    args_block = "\n".join(f"  {k}: {_fmt_arg(v)}" for k, v in args.items()) or "  (no args)"
    _console.print(
        Panel.fit(
            f"Tool: [bold]{name}[/bold]\n{args_block}",
            title="⚠️  CONFIRMATION REQUIRED",
            border_style="yellow",
        )
    )
    return Confirm.ask("Approve?", default=False)


def _fmt_arg(value: Any) -> str:
    """Collapse multi-line / long values in the argument panels."""
    text = repr(value)
    if isinstance(value, str) and ("\n" in value or len(value) > 80):
        first_line = value.splitlines()[0] if value else ""
        return f"<{len(value)} chars, {value.count(chr(10)) + 1} lines> {first_line!r}…"
    return text


def _render_write_preview(args: dict[str, Any]) -> None:
    """Render a unified diff of the pending write_source_file change."""
    file_path = args.get("file_path", "")
    new_content = args.get("content", "")

    existing = ""
    try:
        from roscode.tools._state import resolve_inside_workspace

        target = resolve_inside_workspace(file_path)
        if target.exists() and target.is_file():
            existing = target.read_text(errors="replace")
    except (ValueError, RuntimeError):
        # Path resolution failed — the tool itself will return the error string.
        # Still show a creation preview against empty.
        existing = ""

    diff_lines = list(
        difflib.unified_diff(
            existing.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            n=3,
        )
    )
    diff_text = "".join(diff_lines) or "(no textual difference)"

    _console.print(
        Panel(
            Syntax(diff_text, "diff", theme="ansi_dark", line_numbers=False),
            title=f"proposed change: {file_path}",
            border_style="yellow",
        )
    )
