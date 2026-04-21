"""Main agentic loop for roscode.

The loop alternates between Anthropic model calls and tool execution. Tools
whose names appear in DESTRUCTIVE_TOOLS require human confirmation before
running — do not remove this gate.
"""

from __future__ import annotations

from anthropic import Anthropic

from roscode.config import load_settings
from roscode.prompts import build_system_prompt
from roscode.tools import TOOL_DEFINITIONS, TOOL_MAP, set_workspace
from roscode.ui import (
    confirm_action,
    print_agent_message,
    print_tool_call,
    print_tool_result,
)

DESTRUCTIVE_TOOLS: set[str] = {
    "write_source_file",
    "workspace_build",
    "node_spawn",
    "node_kill",
    "param_set",
    "package_scaffold",
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
    model_id = model or settings.model

    set_workspace(workspace_path)

    client = Anthropic()
    system_prompt = build_system_prompt(workspace_path)
    messages: list[dict] = [{"role": "user", "content": user_request}]

    for _ in range(max_iterations):
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
                    print_agent_message(block.text)
            return

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                print_tool_call(block.name, block.input)

                if block.name in DESTRUCTIVE_TOOLS and not auto_confirm:
                    approved = confirm_action(block.name, block.input)
                    if not approved:
                        result: object = "Action declined by user."
                    else:
                        result = TOOL_MAP[block.name](**block.input)
                else:
                    result = TOOL_MAP[block.name](**block.input)

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
