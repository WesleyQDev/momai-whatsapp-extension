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
    safe: bool = False
    
    def __init__(self, original_tool: BaseTool, manifest: Any = None):
        super().__init__(
            name=original_tool.name,
            description=original_tool.description,
            args_schema=original_tool.args_schema,
            return_direct=original_tool.return_direct,
            original_tool=original_tool,
            plugin_manifest=manifest
        )
        self.original_tool = original_tool
        self.plugin_manifest = manifest
        
        # Inherit safety flag if present on the tool itself
        tool_is_safe = getattr(original_tool, "safe", False)
        
        # Check if the tool is declared as safe in the manifest's safe_tools list
        manifest_is_safe = False
        if manifest and hasattr(manifest, 'features') and hasattr(manifest.features, 'safe_tools'):
            manifest_is_safe = original_tool.name in manifest.features.safe_tools
        
        self.safe = tool_is_safe or manifest_is_safe

    def _check_permission(self) -> bool:
        """Checks permissions declared explicitly by the extension tool."""
        if not self.plugin_manifest:
            return True # Native/Core tools

        required = getattr(self.original_tool, "required_permissions", None)
        if not required:
            return True

        if isinstance(required, str):
            required = [required]

        denied = []
        for permission in required:
            key = str(permission).strip().lower()
            if not key:
                continue
            allowed = bool(getattr(self.plugin_manifest.permissions, key, False))
            if not allowed:
                denied.append(key)

        if denied:
            logger.warning(
                f"Blocking {self.name}: Plugin {self.plugin_manifest.id} missing permissions: {', '.join(denied)}"
            )
            return False
            
        return True

    def _run(self, *args, **kwargs):
        if not self._check_permission():
            return f"Error: The extension '{self.plugin_manifest.name}' does not have the required permission for this action."
            
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
        if not self._check_permission():
            return f"Error: The extension '{self.plugin_manifest.name}' does not have the required permission for this action."

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
