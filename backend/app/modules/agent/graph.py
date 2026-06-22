import os
from typing import TypedDict, Annotated, Sequence, Dict, Any, List
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
import json

from app.config import settings
from .tools import get_portfolio, search_web, calculate_returns

# Define the state shape
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

# Create tools list
tools = [get_portfolio, search_web, calculate_returns]
tool_map = {t.name: t for t in tools}

# Function to run the rule-based agent when LLM keys are not set
def mock_agent_node(state: AgentState, config: RunnableConfig):
    """
    A smart rule-based agent node that simulates LLM thinking and tool usage.
    Ensures the app is fully functional even without OpenAI or Gemini keys.
    """
    messages = state["messages"]
    last_message = messages[-1]
    query = last_message.content.lower()
    
    # 1. Identify which tool to call based on keywords
    tool_calls = []
    
    # Check for portfolio query
    if any(k in query for k in ["carteira", "portfolio", "investimento", "saldo", "meus ativos", "minhas acoes"]):
        tool_calls.append({
            "name": "get_portfolio",
            "args": {},
            "id": "call_portfolio_1"
        })
        
    # Check for news or market pricing
    elif any(k in query for k in ["mercado", "cotacao", "noticia", "preço", "aapl", "tsla", "petr4", "vale3", "ivvb11", "bova11", "btc", "hoje"]):
        # Find which asset to search
        asset = "market conditions"
        for t in ["AAPL", "TSLA", "PETR4", "VALE3", "IVVB11", "BOVA11", "BTC"]:
            if t.lower() in query:
                asset = t
                break
        tool_calls.append({
            "name": "search_web",
            "args": {"query": f"latest stock news and price for {asset}"},
            "id": "call_search_1"
        })
        
    # Check for compound interest or return projections
    elif any(k in query for k in ["simular", "projetar", "juros", "rendimento", "calcula", "retorno"]):
        # Try to parse numbers from query or use defaults
        principal = 1000.0
        rate = 10.0
        years = 10
        contrib = 100.0
        
        # Simple extraction helper
        import re
        numbers = re.findall(r"\d+", query)
        if len(numbers) >= 3:
            principal = float(numbers[0])
            rate = float(numbers[1])
            years = int(numbers[2])
            if len(numbers) >= 4:
                contrib = float(numbers[3])
        
        tool_calls.append({
            "name": "calculate_returns",
            "args": {"principal": principal, "annual_rate": rate, "years": years, "monthly_contribution": contrib},
            "id": "call_calc_1"
        })
        
    # 2. If a tool needs to be called, return an AIMessage indicating the tool call
    if tool_calls:
        return {
            "messages": [
                AIMessage(
                    content=f"Analisando sua pergunta... Vou consultar as informações necessárias para te responder.",
                    tool_calls=tool_calls
                )
            ]
        }
        
    # 3. If no tool needs to be called, generate a helpful general assistant response
    response_text = (
        "Olá! Sou o Flow Agent, seu assistente de investimentos integrado.\n\n"
        "Posso te ajudar com as seguintes tarefas:\n"
        "1. **Ver sua carteira:** Mostro suas ações, ETFs, preço médio e rentabilidade (ex: *'como está minha carteira?'*)\n"
        "2. **Pesquisa de Mercado:** Busco as últimas notícias e cotações em tempo real de ativos (ex: *'notícias de AAPL hoje'*)\n"
        "3. **Simulador Financeiro:** Faço projeções de juros compostos para seus aportes (ex: *'simule 5000 a 12% por 10 anos'*)\n\n"
        "Como posso ajudar você hoje?"
    )
    return {"messages": [AIMessage(content=response_text)]}

# Function to execute tools manually in mock mode
def mock_tool_node(state: AgentState, config: RunnableConfig):
    messages = state["messages"]
    last_message = messages[-1]
    
    tool_messages = []
    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        tool_id = tool_call["id"]
        
        # Execute tool
        tool_func = tool_map[tool_name]
        # Inject config for get_portfolio tool
        if tool_name == "get_portfolio":
            result = tool_func.invoke(tool_args, config=config)
        else:
            result = tool_func.invoke(tool_args)
            
        tool_messages.append(
            ToolMessage(content=str(result), tool_name=tool_name, tool_call_id=tool_id)
        )
        
    return {"messages": tool_messages}

# Node to formulate final answer after tools run in mock mode
def mock_responder_node(state: AgentState, config: RunnableConfig):
    messages = state["messages"]
    
    # Find last tool messages
    tool_msgs = [m for m in messages if isinstance(m, ToolMessage)]
    if not tool_msgs:
        return {"messages": [AIMessage(content="Desculpe, não consegui obter os dados necessários.")]}
        
    last_tool_msg = tool_msgs[-1]
    tool_name = last_tool_msg.tool_name
    content = last_tool_msg.content
    
    # Formulate responses based on tool outputs
    if tool_name == "get_portfolio":
        response = (
            f"Abaixo está o resumo dos seus investimentos atuais:\n\n{content}\n\n"
            "Deseja analisar a alocação de algum ativo específico ou fazer uma simulação de aportes?"
        )
    elif tool_name == "search_web":
        response = (
            f"Aqui estão as informações de mercado que encontrei:\n\n{content}\n\n"
            "Gostaria de calcular projeções ou saber mais sobre o impacto disso na sua carteira?"
        )
    elif tool_name == "calculate_returns":
        data = json.loads(content)
        response = (
            f"**Simulação de Projeção Concluída!** 📈\n\n"
            f"- **Valor Final Projetado:** ${data['total_value']:,}\n"
            f"- **Total Investido:** ${data['total_invested']:,}\n"
            f"- **Retorno Líquido:** ${data['total_returns']:,}\n"
            f"- **Rendimento Percentual:** {data['yield_percent']}%\n\n"
            "Esta simulação demonstra a força dos juros compostos ao longo do tempo. Quer ajustar os valores para ver outros cenários?"
        )
    else:
        response = f"Aqui está o resultado da análise:\n{content}"
        
    return {"messages": [AIMessage(content=response)]}

# Determine if LLM keys are configured to build a standard LangGraph graph
has_llm_key = False
llm = None

# We can try to import LangChain Chat Models
try:
    if settings.ANTHROPIC_API_KEY:
        from langchain_anthropic import ChatAnthropic
        os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY
        llm = ChatAnthropic(model="claude-haiku-4-5", temperature=0.5)
        has_llm_key = True
    elif settings.GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        # Set environment variable just in case
        os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.5)
        has_llm_key = True
    elif settings.OPENAI_API_KEY:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.5)
        has_llm_key = True
except Exception:
    has_llm_key = False

# Build Graph
workflow = StateGraph(AgentState)

if has_llm_key and llm is not None:
    # Standard LangGraph implementation with bound tools
    llm_with_tools = llm.bind_tools(tools)
    
    def call_model(state: AgentState, config: RunnableConfig):
        messages = state["messages"]
        # Add system message to ground the agent
        system_msg = SystemMessage(
            content=(
                "Você é o Flow Agent, um assistente financeiro de elite integrado à plataforma Flow Investment.\n"
                "Seu papel é ajudar o usuário a acompanhar seus investimentos, analisar sua carteira, "
                "buscar cotações/notícias em tempo real e fazer cálculos de projeção.\n"
                "Sempre responda em Português de forma profissional, clara e amigável.\n"
                "Quando o usuário perguntar sobre a própria carteira ou saldos, use a ferramenta 'get_portfolio'.\n"
                "Quando perguntar sobre cotações, notícias ou mercado, use a ferramenta 'search_web'.\n"
                "Quando pedir simulações ou projeções de investimentos, use a ferramenta 'calculate_returns'."
            )
        )
        response = llm_with_tools.invoke([system_msg] + messages, config=config)
        return {"messages": [response]}
        
    workflow.add_node("agent", call_model)
    workflow.add_node("action", ToolNode(tools))
    
    workflow.set_entry_point("agent")
    
    def should_continue(state: AgentState):
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "action"
        return END
        
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "action": "action",
            END: END
        }
    )
    workflow.add_edge("action", "agent")
else:
    # Use the mock agent node flow
    workflow.add_node("agent", mock_agent_node)
    workflow.add_node("tools", mock_tool_node)
    workflow.add_node("responder", mock_responder_node)
    
    workflow.set_entry_point("agent")
    
    def mock_should_continue(state: AgentState):
        last_message = state["messages"][-1]
        if hasattr(last_message, "tool_calls") and last_message.tool_calls:
            return "tools"
        return END
        
    workflow.add_conditional_edges(
        "agent",
        mock_should_continue,
        {
            "tools": "tools",
            END: END
        }
    )
    workflow.add_edge("tools", "responder")
    workflow.add_edge("responder", END)

# Compile Graph
agent_graph = workflow.compile()
