"""Abstract UI surface for the agent loop.

The agent in ``roscode.agent`` used to call ``roscode.ui.print_*`` functions
directly, which coupled the loop to a Rich-based terminal renderer. The studio
webview needs to observe the *same* events but render them as HTML panels
instead of ANSI in a tty.

Every renderer implements [`UiSink`] — the CLI ships [`TerminalSink`] in
``roscode.ui`` and the studio ships [`WebsocketSink`] in ``roscode.server``.
The agent depends only on the protocol.
"""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class UiSink(Protocol):
    """Every method here maps 1:1 to a display event the agent can emit.

    Methods are synchronous and must not block for long on any path other
    than [`confirm_action`] (which inherently waits for human input).
    """

    def session_banner(
        self, model: str, workspace: str, container_status: str | None
    ) -> None:
        """Opening frame. Called once at the start of ``agent.run``."""

    def status(self, text: str) -> None:
        """Dim informational line (e.g. container startup)."""

    def step(self, n: int, total: int) -> None:
        """Ticker between loop iterations so viewers can follow progress."""

    def thinking(self, label: str = "thinking") -> AbstractContextManager[None]:
        """Spinner/indicator context manager shown while the model generates."""

    def reasoning(self, text: str) -> None:
        """Interstitial chain-of-thought text the model emits alongside tool_use."""

    def tool_call(self, name: str, args: dict[str, Any]) -> None:
        """Tool invocation Claude has requested (pre-execution)."""

    def tool_result(self, name: str, result: Any) -> None:
        """Result string from an executed tool."""

    def agent_message(self, text: str) -> None:
        """Final end-of-turn message from the agent."""

    def confirm_action(self, name: str, args: dict[str, Any]) -> bool:
        """Ask the human to approve a destructive tool. Blocks until answered."""
