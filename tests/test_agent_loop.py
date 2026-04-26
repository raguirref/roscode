"""Integration tests for the agent loop.

Scaffold only — full loop tests (mock Anthropic client, mock ROS env,
assert tool_use -> tool_result round-trips and confirmation gating) land
in Task 9.
"""

from __future__ import annotations

from roscode import agent


def test_destructive_tools_set_is_frozen():
    """Regression guard: the confirmation gate covers every writer tool.

    If you add a new destructive tool, add it here AND to agent.DESTRUCTIVE_TOOLS.
    """
    expected = {
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
    assert agent.DESTRUCTIVE_TOOLS == expected


def test_run_is_callable():
    assert callable(agent.run)
