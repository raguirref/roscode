"""Unit tests for individual tool wrappers.

Scaffold only — real per-tool tests (mocking subprocess, asserting output
formatting, path-traversal rejection in fs_tools, etc.) land in Task 9.
"""

from __future__ import annotations

import pytest

from roscode.tools import TOOL_DEFINITIONS, TOOL_MAP


def test_tool_definitions_are_non_empty():
    assert len(TOOL_DEFINITIONS) > 0
    assert len(TOOL_MAP) > 0


def test_every_schema_has_a_callable():
    schema_names = {t["name"] for t in TOOL_DEFINITIONS}
    missing = schema_names - set(TOOL_MAP)
    assert not missing, f"Schemas without a TOOL_MAP entry: {missing}"


def test_every_callable_has_a_schema():
    schema_names = {t["name"] for t in TOOL_DEFINITIONS}
    orphaned = set(TOOL_MAP) - schema_names
    assert not orphaned, f"TOOL_MAP entries without a schema: {orphaned}"


def test_schemas_have_required_keys():
    for tool in TOOL_DEFINITIONS:
        assert "name" in tool
        assert "description" in tool and tool["description"], tool["name"]
        assert "input_schema" in tool and tool["input_schema"].get("type") == "object"


@pytest.mark.parametrize("name", list(TOOL_MAP))
def test_stubs_raise_not_implemented_for_now(name):
    """Scaffold marker: every tool body is currently a NotImplementedError stub.

    Delete this test once real implementations land in Task 3 of the brief.
    """
    fn = TOOL_MAP[name]
    schema = next(t for t in TOOL_DEFINITIONS if t["name"] == name)
    required = schema["input_schema"].get("required", [])
    dummy_args = {k: "x" for k in required}
    with pytest.raises(NotImplementedError):
        fn(**dummy_args)
