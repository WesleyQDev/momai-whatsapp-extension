from langchain_core.tools import tool

@tool
def open_model_selector() -> str:
    """
    Open the model selector interface.
    
    Returns:
        Success message
    """
    return "Opening model selector..."

@tool
def get_momai_resources_tool() -> str:
    """
    Get information about MomAI resources and capabilities.
    
    Returns:
        Resources information
    """
    return "MomAI Resources: Local AI, Voice, Extensions..."

@tool
def show_graph() -> str:
    """
    Show the agent graph visualization.
    
    Returns:
        Success message
    """
    return "Showing graph..."
