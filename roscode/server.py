"""WebSocket server exposing the roscode agent for the studio webview.

Runs inside the Lima VM's ROS container. The Tauri app's chat panel opens
a WebSocket to ``ws://localhost:9000`` (via Lima port-forward) and drives
the agent by sending JSON messages.

## Wire protocol

All frames are JSON objects with a ``type`` field.

### Client → server

- ``{"type": "prompt", "text": str, "workspace": str, "model"?: str, "max_iterations"?: int}``
- ``{"type": "confirm_response", "id": str, "approved": bool}``

### Server → client

- ``{"type": "banner", "model": str, "workspace": str, "container_status": str|null}``
- ``{"type": "status", "text": str}``
- ``{"type": "step", "n": int, "total": int}``
- ``{"type": "thinking_start", "label": str}``
- ``{"type": "thinking_end"}``
- ``{"type": "reasoning", "text": str}``
- ``{"type": "tool_call", "name": str, "args": object}``
- ``{"type": "tool_result", "name": str, "result": str, "is_error": bool}``
- ``{"type": "confirm_request", "id": str, "name": str, "args": object, "diff_preview"?: str}``
- ``{"type": "agent_message", "text": str}``
- ``{"type": "session_end"}``
- ``{"type": "error", "message": str}``

One connection handles one prompt at a time. Future prompts queue.

Run as a module:: ``python -m roscode.server --port 9000``
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import logging
import threading
import uuid
from contextlib import AbstractContextManager, nullcontext
from typing import Any

import websockets
from dotenv import load_dotenv
from websockets.asyncio.server import ServerConnection, serve

from roscode import agent

# Load .env from CWD or any parent so the Anthropic SDK picks up the key
# whether the server is launched from the host CLI or spawned inside the
# container (where we also bind-mount the repo root).
load_dotenv()

log = logging.getLogger("roscode.server")


class WebsocketSink:
    """UiSink implementation that serializes every event as JSON over a
    WebSocket. The agent runs in a thread (``asyncio.to_thread``); this
    sink bridges the sync↔async boundary via ``run_coroutine_threadsafe``.
    """

    def __init__(self, websocket: ServerConnection, loop: asyncio.AbstractEventLoop) -> None:
        self._ws = websocket
        self._loop = loop
        self._pending: dict[str, threading.Event] = {}
        self._responses: dict[str, bool] = {}

    # --- sink surface ------------------------------------------------------

    def session_banner(
        self, model: str, workspace: str, container_status: str | None
    ) -> None:
        self._send(
            {
                "type": "banner",
                "model": model,
                "workspace": workspace,
                "container_status": container_status,
            }
        )

    def status(self, text: str) -> None:
        self._send({"type": "status", "text": text})

    def step(self, n: int, total: int) -> None:
        self._send({"type": "step", "n": n, "total": total})

    def thinking(self, label: str = "thinking") -> AbstractContextManager[None]:
        self._send({"type": "thinking_start", "label": label})

        class _End:
            def __enter__(_self):  # noqa: N805
                return None

            def __exit__(_self, *_exc):  # noqa: N805
                self._send({"type": "thinking_end"})
                return False

        return _End()

    def reasoning(self, text: str) -> None:
        if not text.strip():
            return
        self._send({"type": "reasoning", "text": text})

    def tool_call(self, name: str, args: dict[str, Any]) -> None:
        self._send({"type": "tool_call", "name": name, "args": args})

    def tool_result(self, name: str, result: Any) -> None:
        body = str(result)
        is_error = _looks_like_error(body)
        self._send(
            {"type": "tool_result", "name": name, "result": body, "is_error": is_error}
        )

    def agent_message(self, text: str) -> None:
        if not text.strip():
            return
        self._send({"type": "agent_message", "text": text})

    def confirm_action(self, name: str, args: dict[str, Any]) -> bool:
        req_id = str(uuid.uuid4())
        event = threading.Event()
        self._pending[req_id] = event

        payload: dict[str, Any] = {
            "type": "confirm_request",
            "id": req_id,
            "name": name,
            "args": args,
        }
        if name == "write_source_file":
            payload["diff_preview"] = _build_diff_preview(args)
        self._send(payload)

        # Block the agent thread until the webview replies.
        event.wait()
        return self._responses.pop(req_id, False)

    # --- inbound wiring ----------------------------------------------------

    def deliver_confirm_response(self, req_id: str, approved: bool) -> None:
        """Called from the async read loop when a ``confirm_response`` arrives."""
        self._responses[req_id] = approved
        ev = self._pending.pop(req_id, None)
        if ev is not None:
            ev.set()

    # --- internal ----------------------------------------------------------

    def _send(self, payload: dict[str, Any]) -> None:
        """Thread-safe send. Called from the agent thread."""
        coro = self._ws.send(json.dumps(payload))
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        try:
            fut.result(timeout=10)
        except Exception as e:  # noqa: BLE001
            log.warning("failed to send %s: %s", payload.get("type"), e)


def _looks_like_error(body: str) -> bool:
    head = body.lstrip()[:64].lower()
    return head.startswith("error") or head.startswith("build failed") or "traceback" in head


def _build_diff_preview(args: dict[str, Any]) -> str:
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

    diff = "".join(
        difflib.unified_diff(
            existing.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            n=3,
        )
    )
    return diff or "(no textual difference)"


async def _handle_connection(websocket: ServerConnection) -> None:
    loop = asyncio.get_running_loop()
    sink = WebsocketSink(websocket, loop)
    current: asyncio.Task[None] | None = None

    log.info("client connected from %s", websocket.remote_address)
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send(
                    json.dumps({"type": "error", "message": "malformed JSON"})
                )
                continue

            kind = msg.get("type")
            if kind == "prompt":
                if current and not current.done():
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "error",
                                "message": "a prompt is already in flight",
                            }
                        )
                    )
                    continue
                current = asyncio.create_task(_run_prompt(websocket, sink, msg))
            elif kind == "confirm_response":
                sink.deliver_confirm_response(msg["id"], bool(msg.get("approved", False)))
            else:
                await websocket.send(
                    json.dumps({"type": "error", "message": f"unknown type: {kind}"})
                )
    except websockets.ConnectionClosed:
        log.info("client disconnected")
    finally:
        if current and not current.done():
            current.cancel()


async def _run_prompt(
    websocket: ServerConnection, sink: WebsocketSink, msg: dict[str, Any]
) -> None:
    try:
        await asyncio.to_thread(
            agent.run,
            user_request=msg["text"],
            workspace_path=msg["workspace"],
            model=msg.get("model"),
            max_iterations=int(msg.get("max_iterations", 20)),
            sink=sink,
        )
    except Exception as e:  # noqa: BLE001
        log.exception("agent run failed")
        await websocket.send(json.dumps({"type": "error", "message": str(e)}))
    finally:
        try:
            await websocket.send(json.dumps({"type": "session_end"}))
        except websockets.ConnectionClosed:
            pass


async def _serve(host: str, port: int) -> None:
    log.info("listening on ws://%s:%d", host, port)
    async with serve(_handle_connection, host, port):
        await asyncio.Future()  # run forever


def main() -> None:
    parser = argparse.ArgumentParser(description="roscode agent WebSocket server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=9000)
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(_serve(args.host, args.port))


if __name__ == "__main__":
    main()
