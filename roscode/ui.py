"""Rich-based terminal renderer for roscode.

Implements [`UiSink`][roscode.ui_protocol.UiSink]. Every CLI session runs the
agent against an instance of [`TerminalSink`]; the studio webview runs it
against ``roscode.server.WebsocketSink`` instead.

Keep this file clean — it's the demo surface.
"""

from __future__ import annotations

import difflib
from contextlib import AbstractContextManager, contextmanager, nullcontext
from typing import Any, Iterator

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.syntax import Syntax
from rich.text import Text

# Tools that mutate the workspace or the live ROS graph.  Kept in sync with
# ``roscode.agent.DESTRUCTIVE_TOOLS`` — used only for UI styling, not gating.
_DESTRUCTIVE_TOOLS: frozenset[str] = frozenset(
    {
        "write_source_file",
        "workspace_build",
        "node_spawn",
        "node_kill",
        "param_set",
        "package_scaffold",
        "topic_publish",
        "action_send_goal",
        "relay_autotune",
    }
)


class TerminalSink:
    """Rich-based implementation of the agent's UI surface.

    Used when roscode runs as a CLI. Produces ANSI panels on the user's
    terminal. Module-level state is limited to a single [`rich.console.Console`].
    """

    def __init__(self, console: Console | None = None) -> None:
        self._console = console or Console()

    # --- headers and status -------------------------------------------------

    def session_banner(
        self, model: str, workspace: str, container_status: str | None
    ) -> None:
        lines = [
            Text.assemble(
                ("roscode", "bold cyan"),
                (" — ROS 2 agent powered by ", "dim"),
                (model, "bold"),
            ),
            Text.assemble(("workspace ", "dim"), (workspace, "white")),
        ]
        if container_status:
            lines.append(Text.assemble(("runtime   ", "dim"), (container_status, "white")))
        else:
            lines.append(Text.assemble(("runtime   ", "dim"), ("native ros2 on PATH", "white")))

        body = Text("\n").join(lines)
        self._console.print(Panel(body, border_style="cyan", padding=(0, 2)))

    def status(self, text: str) -> None:
        self._console.print(f"[dim]▸ {text}[/dim]")

    def step(self, n: int, total: int) -> None:
        self._console.print(f"[dim]─── step {n}/{total} ───[/dim]")

    def thinking(self, label: str = "thinking") -> AbstractContextManager[None]:
        return _status_context(self._console, label)

    # --- agent-emitted content ---------------------------------------------

    def reasoning(self, text: str) -> None:
        stripped = text.strip()
        if not stripped:
            return
        self._console.print(Text.assemble(("🤔  ", "magenta"), (stripped, "italic dim")))

    def agent_message(self, text: str) -> None:
        stripped = text.strip()
        if not stripped:
            return
        self._console.print(
            Panel(
                Text(stripped, style="cyan"),
                title="🤖 agent",
                border_style="cyan",
                padding=(0, 1),
            )
        )

    # --- tool lifecycle -----------------------------------------------------

    def tool_call(self, name: str, args: dict[str, Any]) -> None:
        destructive = name in _DESTRUCTIVE_TOOLS
        icon = "✏️ " if destructive else "🔍"
        border = "yellow" if destructive else "blue"
        args_block = "\n".join(f"  {k}: {_fmt_arg(v)}" for k, v in args.items()) or "  (no args)"
        self._console.print(
            Panel.fit(args_block, title=f"{icon} {name}", border_style=border)
        )

    def tool_result(self, name: str, result: Any) -> None:
        body = str(result)
        if body.count("\n") > 60:
            lines = body.splitlines()
            body = "\n".join(
                lines[:30]
                + ["  …", f"  ({len(lines) - 40} lines elided)", "  …"]
                + lines[-10:]
            )

        border = "red" if _is_error(body) else "green"
        icon = "⚠️ " if _is_error(body) else "✅"
        self._console.print(
            Panel.fit(body, title=f"{icon} {name} result", border_style=border)
        )

    def confirm_action(self, name: str, args: dict[str, Any]) -> bool:
        if name == "write_source_file":
            self._render_write_preview(args)

        args_block = "\n".join(f"  {k}: {_fmt_arg(v)}" for k, v in args.items()) or "  (no args)"
        self._console.print(
            Panel.fit(
                f"Tool: [bold]{name}[/bold]\n{args_block}",
                title="⚠️  CONFIRMATION REQUIRED",
                border_style="yellow",
            )
        )
        return Confirm.ask("Approve?", default=False)

    # --- internal -----------------------------------------------------------

    def _render_write_preview(self, args: dict[str, Any]) -> None:
        file_path = args.get("file_path", "")
        new_content = args.get("content", "")

        existing = ""
        try:
            from roscode.tools._state import resolve_inside_workspace

            target = resolve_inside_workspace(file_path)
            if target.exists() and target.is_file():
                existing = target.read_text(errors="replace")
        except (ValueError, RuntimeError):
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

        self._console.print(
            Panel(
                Syntax(diff_text, "diff", theme="ansi_dark", line_numbers=False),
                title=f"proposed change: {file_path}",
                border_style="yellow",
            )
        )


@contextmanager
def _status_context(console: Console, label: str) -> Iterator[None]:
    with console.status(f"[cyan]{label}…[/cyan]", spinner="dots"):
        yield


def _is_error(body: str) -> bool:
    head = body.lstrip()[:64].lower()
    return head.startswith("error") or head.startswith("build failed") or "traceback" in head


def _fmt_arg(value: Any) -> str:
    """Collapse multi-line / long values in the argument panels."""
    if isinstance(value, str) and ("\n" in value or len(value) > 80):
        first_line = value.splitlines()[0] if value else ""
        preview = first_line if len(first_line) <= 60 else first_line[:60] + "…"
        n_lines = value.count("\n") + 1
        return f"<{len(value)} chars, {n_lines} lines> {preview!r}"
    return repr(value)


class NullSink:
    """No-op sink. Useful for tests and for the `--quiet` flag we may add."""

    def session_banner(self, *_args, **_kwargs) -> None: ...
    def status(self, *_args, **_kwargs) -> None: ...
    def step(self, *_args, **_kwargs) -> None: ...
    def thinking(self, label: str = "thinking") -> AbstractContextManager[None]:
        return nullcontext()
    def reasoning(self, *_args, **_kwargs) -> None: ...
    def tool_call(self, *_args, **_kwargs) -> None: ...
    def tool_result(self, *_args, **_kwargs) -> None: ...
    def agent_message(self, *_args, **_kwargs) -> None: ...
    def confirm_action(self, *_args, **_kwargs) -> bool:
        return True  # auto-approve; only used in tests
