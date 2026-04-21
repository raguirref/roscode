"""Rich-based terminal UI for roscode.

Scaffold only — the final demo styling (panels, syntax-highlighted diffs,
spinners) lands in Task 7. For now these functions produce readable, non-
ugly output so agent.py and cli.py can import and run end-to-end.
"""

from __future__ import annotations

from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm

_console = Console()


def print_agent_message(text: str) -> None:
    _console.print(f"[bold cyan]🤖[/bold cyan]  {text}")


def print_tool_call(name: str, args: dict[str, Any]) -> None:
    args_block = "\n".join(f"  {k}: {v!r}" for k, v in args.items()) or "  (no args)"
    _console.print(
        Panel.fit(
            args_block,
            title=f"🔧 {name}",
            border_style="blue",
        )
    )


def print_tool_result(name: str, result: Any) -> None:
    _console.print(
        Panel.fit(
            str(result),
            title=f"✅ {name} result",
            border_style="green",
        )
    )


def confirm_action(name: str, args: dict[str, Any]) -> bool:
    args_block = "\n".join(f"  {k}: {v!r}" for k, v in args.items()) or "  (no args)"
    _console.print(
        Panel.fit(
            f"Tool: [bold]{name}[/bold]\n{args_block}",
            title="⚠️  CONFIRMATION REQUIRED",
            border_style="yellow",
        )
    )
    return Confirm.ask("Approve?", default=False)
