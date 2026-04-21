"""Cross-module tool-registry sanity tests.

Per-module behaviour tests live in test_ros_tools.py, test_fs_tools.py,
test_build_tools.py.
"""

from __future__ import annotations

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


