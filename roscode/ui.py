"""Rich-based terminal renderer for roscode.

Implements [`UiSink`][roscode.ui_protocol.UiSink]. Every CLI session runs the
agent against an instance of [`TerminalSink`]; the studio webview runs it
against ``roscode.server.WebsocketSink`` instead.

Keep this file clean — it's the demo surface.
"""

from __future__ import annotations

import difflib
from contextlib import AbstractContextManager, contextmanager, nullcontext
from pathlib import Path
from typing import Any, Iterator

from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.syntax import Syntax
from rich.text import Text
from rich.tree import Tree

# Tools that mutate the workspace or the live ROS graph. Kept in sync with
# ``roscode.agent.DESTRUCTIVE_TOOLS`` — used only for UI styling, not gating.
_DESTRUCTIVE_TOOLS: frozenset[str] = frozenset(
    {
        "write_source_file",
        "workspace_build",
        "node_spawn",
        "node_kill",
        "ros_launch",
        "param_set",
        "package_scaffold",
        "pkg_install",
        "topic_publish",
        "action_send_goal",
        "relay_autotune",
    }
)

# Palette for package blocks — cycles through so each package has a distinct colour.
_PKG_COLOURS = ["cyan", "magenta", "green", "yellow", "blue", "red"]


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
        # workspace_map gets a rich block-diagram renderer instead of plain text.
        if name == "workspace_map" and not _is_error(str(result)):
            self._render_workspace_blocks()
            return

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

    def _render_workspace_blocks(self) -> None:
        """Render workspace_map result as coloured Rich block panels — one per package."""
        from roscode.tools.analysis_tools import _get_workspace_data  # lazy import

        data = _get_workspace_data()
        if isinstance(data, str):
            self._console.print(Panel(data, title="⚠️ workspace_map", border_style="red"))
            return

        pkg_data = data["packages"]
        topic_graph = data["topic_graph"]

        header = Text.assemble(
            ("WORKSPACE  ", "bold white"),
            (f"{len(pkg_data)} pkg  ·  {data['total_nodes']} nodes  ·  {data['total_topics']} topics",
             "dim"),
        )
        self._console.print(header)
        self._console.print()

        # ── Package blocks (side-by-side via Columns) ─────────────────────────
        panels: list[Panel] = []
        for idx, (pkg_name, pdata) in enumerate(pkg_data.items()):
            colour = _PKG_COLOURS[idx % len(_PKG_COLOURS)]
            tree = Tree(f"[bold]{pkg_name}[/bold]", guide_style=colour)

            meaningful_deps = [d for d in pdata["deps"] if d not in ("rclpy",) and not d.startswith("ament_")]
            if meaningful_deps:
                dep_branch = tree.add("[dim]deps[/dim]")
                for dep in meaningful_deps[:6]:
                    dep_branch.add(f"[dim]{dep}[/dim]")
                if len(meaningful_deps) > 6:
                    dep_branch.add(f"[dim]… +{len(meaningful_deps) - 6} more[/dim]")

            for file_rel, a in pdata["files"].items():
                fname = Path(file_rel).name
                node_label = ", ".join(a["node_classes"]) or fname.replace(".py", "")
                hz = f"  [dim]@ {a['timer_hz'][0]} Hz[/dim]" if a["timer_hz"] else ""
                node_branch = tree.add(f"[bold {colour}]{node_label}[/bold {colour}]{hz}")

                for topic, msg in a["publishers"]:
                    node_branch.add(f"[green]▶ pub[/green]  {topic}  [dim]{msg}[/dim]")
                for topic, msg in a["subscribers"]:
                    node_branch.add(f"[blue]◀ sub[/blue]  {topic}  [dim]{msg}[/dim]")
                for svc, srv in a["services"]:
                    node_branch.add(f"[yellow]⚙ srv[/yellow]  {svc}  [dim]{srv}[/dim]")
                for pname, default in a["parameters"]:
                    val = f"[dim] = {default!r}[/dim]" if default is not None else ""
                    node_branch.add(f"[yellow]⚙ param[/yellow]  {pname}{val}")

            if not pdata["files"]:
                tree.add("[dim](no Python nodes found)[/dim]")

            panels.append(Panel(tree, border_style=colour, padding=(0, 1)))

        self._console.print(Columns(panels, equal=False, expand=True))
        self._console.print()

        # ── Data flow graph ───────────────────────────────────────────────────
        if topic_graph:
            flow_tree = Tree("[bold yellow]DATA FLOW[/bold yellow]", guide_style="yellow")
            for topic in sorted(topic_graph):
                tg = topic_graph[topic]
                pubs_str = " [dim]+[/dim] ".join(f"[green]{p}[/green]" for p in tg["pubs"]) or "[dim](external)[/dim]"
                subs_str = " [dim]+[/dim] ".join(f"[blue]{s}[/blue]" for s in tg["subs"]) or "[dim]∅[/dim]"
                branch = flow_tree.add(f"[bold]{topic}[/bold]")
                branch.add(f"{pubs_str}  [yellow]──▶[/yellow]  {subs_str}")
            self._console.print(Panel(flow_tree, border_style="yellow", padding=(0, 1)))


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
