"""Main agentic loop for roscode.

The loop alternates between Anthropic model calls and tool execution. Tools
whose names appear in DESTRUCTIVE_TOOLS require human confirmation before
running — do not remove this gate.

All output goes through a [`UiSink`][roscode.ui_protocol.UiSink] — either
the terminal renderer (``TerminalSink``) or the studio WebSocket bridge
(``WebsocketSink``). The agent itself never prints.
"""

from __future__ import annotations

from pathlib import Path

from anthropic import Anthropic

from roscode import container
from roscode.config import load_settings
from roscode.prompts import build_system_prompt
from roscode.tools import TOOL_DEFINITIONS, TOOL_MAP, set_workspace
from roscode.ui import TerminalSink
from roscode.ui_protocol import UiSink

DESTRUCTIVE_TOOLS: set[str] = {
    "write_source_file",
    "workspace_build",
    "node_spawn",
    "node_kill",
    "param_set",
    "package_scaffold",
    # Runtime control — these actuate the physical (or simulated) robot.
    # `topic_publish` is gated because every publish is a potential motion
    # command; batch via count/rate_hz to keep confirmations per-burst.
    "topic_publish",
    "action_send_goal",
    "relay_autotune",
    # robot_estop is intentionally NOT here — the agent must be able to
    # cut motion instantly when analyze_signal detects divergence.
}


def run(
    user_request: str,
    workspace_path: str,
    model: str | None = None,
    max_iterations: int = 20,
    auto_confirm: bool = False,
    sink: UiSink | None = None,
) -> None:
    """Run the roscode agentic loop until end_turn or iteration cap.

    Args:
        user_request: The user's natural-language request.
        workspace_path: Absolute path to the active ROS 2 workspace.
        model: Claude model ID. Defaults to settings (claude-opus-4-7).
        max_iterations: Hard stop on loop length. Defaults to 20.
        auto_confirm: If True, bypass the destructive-tool confirmation gate.
            DANGEROUS — only for automated testing.
        sink: Output surface. Defaults to a new [`TerminalSink`]; the studio
            passes a ``WebsocketSink`` so the same loop streams to the webview.
    """
    settings = load_settings()
    model_id = model or settings.model

    set_workspace(workspace_path)

    ui: UiSink = sink or TerminalSink()

    container_status: str | None = None
    if container.is_needed():
        rt = container.detect_runtime()
        container_status = f"{rt} container (ROS 2 Humble)"
        ui.status(f"ros2 not found locally — starting ROS 2 Humble container via {rt}...")
        container.ensure_running(Path(workspace_path))
        ui.status("container ready.")

    ui.session_banner(model=model_id, workspace=workspace_path, container_status=container_status)

    client = Anthropic()
    system_prompt = build_system_prompt(workspace_path)
    messages: list[dict] = [{"role": "user", "content": user_request}]

    for step_idx in range(1, max_iterations + 1):
        ui.step(step_idx, max_iterations)

        with ui.thinking():
            response = client.messages.create(
                model=model_id,
                max_tokens=4096,
                system=system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    ui.agent_message(block.text)
            return

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            # Show any interstitial reasoning text the model emitted before/between
            # tool_use blocks. Previously this was silently dropped.
            for block in response.content:
                if getattr(block, "type", None) == "text" and getattr(block, "text", ""):
                    ui.reasoning(block.text)

            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                ui.tool_call(block.name, block.input)

                if block.name in DESTRUCTIVE_TOOLS and not auto_confirm:
                    approved = ui.confirm_action(block.name, block.input)
                    if not approved:
                        result: object = "Action declined by user."
                    else:
                        result = TOOL_MAP[block.name](**block.input)
                else:
                    result = TOOL_MAP[block.name](**block.input)

                ui.tool_result(block.name, result)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result),
                    }
                )

            messages.append({"role": "user", "content": tool_results})
            continue

        ui.agent_message(f"Unexpected stop_reason: {response.stop_reason!r}. Halting.")
        return

    ui.agent_message("Max iterations reached. Stopping.")
