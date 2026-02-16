from langchain_core.tools import tool

@tool
def show_interface(content: str, view: str = "side") -> str:
    """
    Display a graphical interface to the user.
    
    Args:
        content: The content to display in the interface
        view: The view mode (side, center, chat)
    
    Returns:
        Success message
    """
    return f"Showing interface in {view} mode"

@tool
def close_interface() -> str:
    """
    Close the current interface.
    
    Returns:
        Success message
    """
    return "Closing interface..."
