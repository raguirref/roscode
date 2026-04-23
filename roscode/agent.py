"""Main agentic loop for roscode.

The loop alternates between Anthropic model calls and tool execution. Tools
whose names appear in DESTRUCTIVE_TOOLS require human confirmation before
running — do not remove this gate.
"""

from __future__ import annotations

from pathlib import Path

from anthropic import Anthropic

from roscode import container
from roscode.config import load_settings
from roscode.prompts import build_system_prompt
from roscode.tools import TOOL_DEFINITIONS, TOOL_MAP, set_workspace
from roscode.ui import (
    confirm_action,
    print_agent_message,
    print_reasoning,
    print_session_banner,
    print_status,
    print_step,
    print_tool_call,
    print_tool_result,
    thinking,
)

DESTRUCTIVE_TOOLS: set[str] = {
    "write_source_file",
    "workspace_build",
    "node_spawn",
    "node_kill",
    "ros_launch",
    "param_set",
    "package_scaffold",
    "pkg_install",
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
) -> None:
    """Run the roscode agentic loop until end_turn or iteration cap.

    Args:
        user_request: The user's natural-language request.
        workspace_path: Absolute path to the active ROS 2 workspace.
        model: Claude model ID. Defaults to settings (claude-opus-4-7).
        max_iterations: Hard stop on loop length. Defaults to 20.
        auto_confirm: If True, bypass the destructive-tool confirmation gate.
            DANGEROUS — only for automated testing.
    """
    settings = load_settings()
    if not settings.anthropic_api_key:
        print_agent_message(
            "ANTHROPIC_API_KEY is not set.\n"
            "Add it to a .env file or export it in your shell:\n"
            "  export ANTHROPIC_API_KEY=sk-ant-..."
        )
        return
    model_id = model or settings.model

    set_workspace(workspace_path)

    container_status: str | None = None
    if container.is_needed():
        rt = container.detect_runtime()
        container_status = f"{rt} container (ROS 2 Humble)"
        print_status(f"ros2 not found locally — starting ROS 2 Humble container via {rt}...")
        container.ensure_running(Path(workspace_path))
        print_status("container ready.")

    print_session_banner(model=model_id, workspace=workspace_path, container_status=container_status)

    client = Anthropic()
    system_prompt = build_system_prompt(workspace_path)
    messages: list[dict] = [{"role": "user", "content": user_request}]

    for step_idx in range(1, max_iterations + 1):
        print_step(step_idx, max_iterations)

        with thinking():
            response = client.messages.create(
                model=model_id,
                max_tokens=8192,
                system=system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    print_agent_message(block.text)
            return

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            # Show any interstitial reasoning text the model emitted before/between
            # tool_use blocks. Previously this was silently dropped.
            for block in response.content:
                if getattr(block, "type", None) == "text" and getattr(block, "text", ""):
                    print_reasoning(block.text)

            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                print_tool_call(block.name, block.input)

                if block.name not in TOOL_MAP:
                    result: object = f"Error: unknown tool {block.name!r}."
                elif block.name in DESTRUCTIVE_TOOLS and not auto_confirm:
                    approved = confirm_action(block.name, block.input)
                    if not approved:
                        result = "Action declined by user."
                    else:
                        try:
                            result = TOOL_MAP[block.name](**block.input)
                        except Exception as exc:
                            result = f"Error: tool {block.name!r} raised {type(exc).__name__}: {exc}"
                else:
                    try:
                        result = TOOL_MAP[block.name](**block.input)
                    except Exception as exc:
                        result = f"Error: tool {block.name!r} raised {type(exc).__name__}: {exc}"

                print_tool_result(block.name, result)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result),
                    }
                )

            messages.append({"role": "user", "content": tool_results})
            continue

        print_agent_message(
            f"Unexpected stop_reason: {response.stop_reason!r}. Halting."
        )
        return

    print_agent_message("Max iterations reached. Stopping.")
