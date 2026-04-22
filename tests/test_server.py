"""Unit tests for roscode.server.

The actual WebSocket lifecycle (accept, serve, close) is covered by an
end-to-end smoke run from the studio. These tests just pin down two
invariants that would otherwise be caught only at runtime:

  1. Both sink implementations satisfy the UiSink protocol.
  2. The WebsocketSink serializes each sink call as the documented
     JSON shape (no silent drift from the protocol docstring).
"""

from __future__ import annotations

import json

import pytest

from roscode.server import WebsocketSink
from roscode.ui import NullSink, TerminalSink
from roscode.ui_protocol import UiSink


def test_terminal_sink_satisfies_protocol():
    assert isinstance(TerminalSink(), UiSink)


def test_null_sink_satisfies_protocol():
    assert isinstance(NullSink(), UiSink)


class _FakeWs:
    """Minimum shim around a websocket for sink testing. Records outgoing frames."""

    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)


class _InlineLoop:
    """Pretends to be an asyncio event loop. run_coroutine_threadsafe() calls
    here execute the coroutine to completion inline — good enough for
    testing the serialization layer without an actual running loop.
    """

    def call_soon_threadsafe(self, fn, *args):  # pragma: no cover - unused
        fn(*args)


@pytest.fixture
def sink_and_ws(monkeypatch):
    ws = _FakeWs()

    import asyncio

    class _Future:
        def __init__(self, coro):
            self._coro = coro

        def result(self, timeout: float = 0):
            # Run the coroutine to completion synchronously.
            asyncio.new_event_loop().run_until_complete(self._coro)
            return None

    monkeypatch.setattr(
        "asyncio.run_coroutine_threadsafe",
        lambda coro, loop: _Future(coro),
    )

    sink = WebsocketSink(ws, loop=_InlineLoop())
    return sink, ws


def test_websocket_sink_satisfies_protocol(sink_and_ws):
    sink, _ = sink_and_ws
    assert isinstance(sink, UiSink)


def test_websocket_sink_emits_banner(sink_and_ws):
    sink, ws = sink_and_ws
    sink.session_banner("claude-opus-4-7", "/ws", "docker container (ROS 2 Humble)")
    assert len(ws.sent) == 1
    frame = json.loads(ws.sent[0])
    assert frame == {
        "type": "banner",
        "model": "claude-opus-4-7",
        "workspace": "/ws",
        "container_status": "docker container (ROS 2 Humble)",
    }


def test_websocket_sink_emits_tool_call_and_result(sink_and_ws):
    sink, ws = sink_and_ws
    sink.tool_call("read_source_file", {"file_path": "src/foo.py"})
    sink.tool_result("read_source_file", "hello")

    call = json.loads(ws.sent[0])
    assert call["type"] == "tool_call"
    assert call["name"] == "read_source_file"
    assert call["args"] == {"file_path": "src/foo.py"}

    result = json.loads(ws.sent[1])
    assert result == {
        "type": "tool_result",
        "name": "read_source_file",
        "result": "hello",
        "is_error": False,
    }


def test_websocket_sink_flags_error_results(sink_and_ws):
    sink, ws = sink_and_ws
    sink.tool_result("workspace_build", "Build FAILED (exit 1)")
    frame = json.loads(ws.sent[0])
    assert frame["is_error"] is True


def test_websocket_sink_thinking_emits_start_and_end(sink_and_ws):
    sink, ws = sink_and_ws
    with sink.thinking("thinking"):
        pass
    assert [json.loads(f)["type"] for f in ws.sent] == ["thinking_start", "thinking_end"]


def test_websocket_sink_drops_empty_reasoning(sink_and_ws):
    sink, ws = sink_and_ws
    sink.reasoning("   \n\t ")
    assert ws.sent == []
