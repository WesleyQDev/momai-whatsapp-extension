from langchain_core.tools import BaseTool, tool
from typing import Any
import traceback
import logging

logger = logging.getLogger("momai.tools")

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
    
    return original_tool # Placeholder: Actually patching would be better.

class SafeExtensionTool(BaseTool):
    """A wrapper for extension tools that ensures they never crash the core and respect permissions."""
    original_tool: BaseTool
    plugin_manifest: Any = None
    
    def __init__(self, original_tool: BaseTool):
        super().__init__(
            name=original_tool.name,
            description=original_tool.description,
            args_schema=original_tool.args_schema,
            return_direct=original_tool.return_direct
        )
        self.original_tool = original_tool

    def _check_permission(self) -> bool:
        """Heuristic to check if the tool usage is consistent with declared permissions."""
        if not self.plugin_manifest:
            return True # Native/Core tools
            
        # Example: If tool name or description suggests filesystem access
        fs_keywords = ["read", "write", "file", "delete", "save", "open"]
        is_fs_tool = any(k in self.name.lower() or k in self.description.lower() for k in fs_keywords)
        
        if is_fs_tool and not self.plugin_manifest.permissions.filesystem:
            logger.warning(f"Blocking {self.name}: Plugin {self.plugin_manifest.id} attempted FS access without permission.")
            return False
            
        return True

    def _run(self, *args, **kwargs):
        if not self._check_permission():
            return f"Error: The extension '{self.plugin_manifest.name}' does not have 'filesystem' permission required for this action."
            
        try:
            return self.original_tool.run(*args, **kwargs)
        except Exception as e:
            logger.error(f"SafeTool Exception in {self.name}: {e}")
            return f"Error: {str(e)}"

    async def _arun(self, *args, **kwargs):
        if not self._check_permission():
            return f"Error: The extension '{self.plugin_manifest.name}' does not have 'filesystem' permission required for this action."

        try:
            return await self.original_tool.arun(*args, **kwargs)
        except Exception as e:
            logger.error(f"SafeTool Exception in {self.name}: {e}")
            return f"Error: {str(e)}"
