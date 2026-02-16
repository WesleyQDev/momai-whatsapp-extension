from langchain_core.tools import BaseTool, tool
from typing import Any, Optional
import traceback
import logging

logger = logging.getLogger("momai.tools")

EXTRAS_KEY = "extras"


def extract_extras(result: Any) -> tuple[str, Optional[dict]]:
    """
    Extracts extras from a tool result if present.

    Returns tuple of (processed_result, extras_dict or None)
    """
    if not isinstance(result, dict):
        return result, None

    extras = result.get(EXTRAS_KEY)
    if extras is None:
        return result, None

    if not isinstance(extras, dict):
        logger.warning(f"Tool returned extras but it's not a dict: {type(extras)}")
        return result, None

    result_copy = dict(result)
    del result_copy[EXTRAS_KEY]

    processed_result = result_copy.get("result", str(result))
    if not processed_result:
        processed_result = str(result_copy) if result_copy else "OK"

    return processed_result, extras


def make_safe_tool(original_tool: BaseTool) -> BaseTool:
    """Wraps a tool to catch exceptions and return a friendly error message."""

    # Check if it's already a BaseTool (langchain tool)
    if not isinstance(original_tool, BaseTool):
        # If it's a raw function, it shouldn't be here since we expect BaseTools
        return original_tool

    async def _safe_run(*args, **kwargs):
        try:
            if original_tool.is_async:
                return await original_tool._arun(*args, **kwargs)
            else:
                import asyncio

                return await asyncio.to_thread(original_tool._run, *args, **kwargs)
        except Exception as e:
            error_msg = f"Error executing tool '{original_tool.name}': {str(e)}"
            logger.error(f"{error_msg}\n{traceback.format_exc()}")
            return f"SYSTEM ERROR: The tool failed. Please inform the user: {error_msg}"

    # We create a new tool based on the original one but with the safe runner
    # Langchain's `@tool` or `StructuredTool` can be used here.
    # For simplicity, we just patch the run method or create a wrapper.

    # Note: Returning a string instead of crashing is key for LLM stability.

    return original_tool  # Placeholder: Actually patching would be better.


class SafeExtensionTool(BaseTool):
    """A wrapper for extension/skill tools that ensures they never crash the core."""

    original_tool: BaseTool

    def __init__(self, original_tool: BaseTool, manifest: Any = None):
        super().__init__(
            name=original_tool.name,
            description=original_tool.description,
            args_schema=original_tool.args_schema,
            return_direct=original_tool.return_direct,
            original_tool=original_tool,
        )
        self.original_tool = original_tool

    def _run(self, *args, **kwargs):
        try:
            tool_input = None
            if args:
                tool_input = args[0]
                if isinstance(tool_input, dict) and kwargs:
                    tool_input = {**tool_input, **kwargs}
            else:
                tool_input = kwargs or {}
            return self.original_tool.invoke(tool_input)
        except Exception as e:
            logger.error(f"SafeTool Exception in {self.name}: {e}")
            return f"Error: {str(e)}"

    async def _arun(self, *args, **kwargs):
        try:
            tool_input = None
            if args:
                tool_input = args[0]
                if isinstance(tool_input, dict) and kwargs:
                    tool_input = {**tool_input, **kwargs}
            else:
                tool_input = kwargs or {}

            if getattr(self.original_tool, "is_async", False):
                return await self.original_tool.ainvoke(tool_input)

            import asyncio

            return await asyncio.to_thread(self.original_tool.invoke, tool_input)
        except Exception as e:
            logger.error(f"SafeTool Exception in {self.name}: {e}")
            return f"Error: {str(e)}"
