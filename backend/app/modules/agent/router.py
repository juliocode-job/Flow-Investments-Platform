from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import time
import os
import asyncio

from app.database import get_db, User, ChatSession, ChatMessage
from app.modules.auth.router import get_current_user
from app.modules.agent.cache import get_cached_response, set_cache_response
from app.observability import log_agent_call
from app.config import settings
from .graph import agent_graph

# Pre-configure env vars for Langfuse SDK (reads from env at import time)
if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
    os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_KEY
    os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_KEY
    os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST

_has_langfuse = bool(settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY)

def _make_langfuse_handler(user_id: int, session_id: int):
    """Create a per-request Langfuse handler scoped to this session."""
    if not _has_langfuse:
        return None
    try:
        from langfuse.langchain import CallbackHandler
        return CallbackHandler(
            user_id=str(user_id),
            session_id=str(session_id),
        )
    except Exception:
        return None

router = APIRouter(prefix="/agent", tags=["agent"])

class ChatMessageSchema(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessageSchema]
    session_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    role: str = "assistant"
    session_id: int

@router.post("/chat", response_model=ChatResponse)
def chat_with_agent(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Interfaces with the LangGraph agent graph. Checks cache first,
    updates persistent chat history in DB, and reports telemetry.
    """
    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Messages history cannot be empty"
        )
        
    query = payload.messages[-1].content
    
    # 1. Fetch or create session
    if payload.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == payload.session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sessão não encontrada"
            )
    else:
        # Create title from first few words of the user query
        words = query.split()
        title = " ".join(words[:4]) if words else "Nova Conversa"
        if len(title) > 30:
            title = title[:27] + "..."
        session = ChatSession(user_id=current_user.id, title=title)
        db.add(session)
        db.commit()
        db.refresh(session)
        
    # 2. Check Cache
    start_time = time.time()
    cached_response = get_cached_response(db, current_user.id, query)
    
    if cached_response:
        latency_ms = (time.time() - start_time) * 1000
        
        # Save messages to db
        user_msg = ChatMessage(session_id=session.id, role="user", content=query)
        ai_msg = ChatMessage(session_id=session.id, role="assistant", content=cached_response)
        db.add_all([user_msg, ai_msg])
        db.commit()
        
        # Log structured call
        log_agent_call(
            user_id=current_user.id,
            query=query,
            response=cached_response,
            latency_ms=latency_ms,
            cache_hit=True,
            session_id=session.id
        )
        
        return ChatResponse(
            response=cached_response,
            session_id=session.id
        )
        
    # 3. Cache Miss: Run agent graph
    # Convert incoming schemas to LangChain message formats
    formatted_messages = []
    for msg in payload.messages:
        if msg.role == "user":
            formatted_messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            formatted_messages.append(AIMessage(content=msg.content))
            
    # Add config with configurable user_id so tools can access user data
    # Inject per-request Langfuse handler so all traces are grouped by session
    langfuse_handler = _make_langfuse_handler(current_user.id, session.id)
    callbacks = [langfuse_handler] if langfuse_handler else []
    config = {
        "configurable": {
            "thread_id": f"user_thread_{current_user.id}_{session.id}",
            "user_id": current_user.id
        },
        "callbacks": callbacks,
        "run_name": f"Flow Agent | session:{session.id}",
        "tags": ["flow-investment", "agent-chat"],
        "metadata": {
            "user_id": current_user.id,
            "session_id": session.id,
            "query": query[:100]
        }
    }
    
    try:
        # Run graph
        result = agent_graph.invoke({"messages": formatted_messages}, config=config)
        
        # Extract the last message (which should be the AI response)
        output_messages = result.get("messages", [])
        response_text = "Não consegui processar a resposta."
        
        if output_messages:
            last_msg = output_messages[-1]
            if isinstance(last_msg, AIMessage):
                response_text = last_msg.content
            else:
                for msg in reversed(output_messages):
                    if isinstance(msg, AIMessage):
                        response_text = msg.content
                        break
                        
        latency_ms = (time.time() - start_time) * 1000
        
        # Save messages to db
        user_msg = ChatMessage(session_id=session.id, role="user", content=query)
        ai_msg = ChatMessage(session_id=session.id, role="assistant", content=response_text)
        db.add_all([user_msg, ai_msg])
        
        # Save to cache
        set_cache_response(db, current_user.id, query, response_text)
        db.commit()
        
        # Log structured call
        log_agent_call(
            user_id=current_user.id,
            query=query,
            response=response_text,
            latency_ms=latency_ms,
            cache_hit=False,
            session_id=session.id
        )
        
        return ChatResponse(
            response=response_text,
            session_id=session.id
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing agent graph: {str(e)}"
        )

@router.post("/chat/stream")
async def chat_with_agent_stream(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Interfaces with the LangGraph agent graph to stream response tokens.
    Checks cache first, updates persistent chat history in DB, and reports telemetry.
    """
    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Messages history cannot be empty"
        )
        
    query = payload.messages[-1].content
    
    # 1. Fetch or create session
    if payload.session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == payload.session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sessão não encontrada"
            )
    else:
        words = query.split()
        title = " ".join(words[:4]) if words else "Nova Conversa"
        if len(title) > 30:
            title = title[:27] + "..."
        session = ChatSession(user_id=current_user.id, title=title)
        db.add(session)
        db.commit()
        db.refresh(session)
        
    # 2. Check Cache
    start_time = time.time()
    cached_response = get_cached_response(db, current_user.id, query)
    
    async def event_generator():
        # Yield session ID first so frontend knows it
        yield f"SESSION_ID:{session.id}\n"
        
        if cached_response:
            # Simulate streaming of cached response in chunks
            words = cached_response.split(" ")
            for i, word in enumerate(words):
                space = " " if i > 0 else ""
                yield space + word
                await asyncio.sleep(0.02)
                
            latency_ms = (time.time() - start_time) * 1000
            
            # Save messages to db
            user_msg = ChatMessage(session_id=session.id, role="user", content=query)
            ai_msg = ChatMessage(session_id=session.id, role="assistant", content=cached_response)
            db.add_all([user_msg, ai_msg])
            db.commit()
            
            log_agent_call(
                user_id=current_user.id,
                query=query,
                response=cached_response,
                latency_ms=latency_ms,
                cache_hit=True,
                session_id=session.id
            )
            return

        # Convert incoming schemas to LangChain message formats
        formatted_messages = []
        for msg in payload.messages:
            if msg.role == "user":
                formatted_messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                formatted_messages.append(AIMessage(content=msg.content))
                
        langfuse_handler = _make_langfuse_handler(current_user.id, session.id)
        callbacks = [langfuse_handler] if langfuse_handler else []
        config = {
            "configurable": {
                "thread_id": f"user_thread_{current_user.id}_{session.id}",
                "user_id": current_user.id
            },
            "callbacks": callbacks,
            "run_name": f"Flow Agent Stream | session:{session.id}",
            "tags": ["flow-investment", "agent-chat-stream"],
        }
        
        response_text = ""
        try:
            from .graph import has_llm_key
            if has_llm_key:
                # Use standard LangGraph events streaming
                async for event in agent_graph.astream_events({"messages": formatted_messages}, config=config, version="v2"):
                    kind = event["event"]
                    if kind == "on_chat_model_stream":
                        content = event["data"]["chunk"].content
                        if content:
                            response_text += content
                            yield content
            else:
                # Mock Mode: stream mock responder node content chunk by chunk
                # Invoke graph synchronously to get the output, then stream it
                result = agent_graph.invoke({"messages": formatted_messages}, config=config)
                output_messages = result.get("messages", [])
                mock_text = "Não consegui processar a resposta."
                if output_messages:
                    for msg in reversed(output_messages):
                        if isinstance(msg, AIMessage) and msg.content:
                            mock_text = msg.content
                            break
                # Stream the mock text chunk by chunk
                words = mock_text.split(" ")
                for i, word in enumerate(words):
                    space = " " if i > 0 else ""
                    chunk = space + word
                    response_text += chunk
                    yield chunk
                    await asyncio.sleep(0.03)

            latency_ms = (time.time() - start_time) * 1000
            
            # Save messages to db
            user_msg = ChatMessage(session_id=session.id, role="user", content=query)
            ai_msg = ChatMessage(session_id=session.id, role="assistant", content=response_text)
            db.add_all([user_msg, ai_msg])
            
            # Save to cache
            set_cache_response(db, current_user.id, query, response_text)
            db.commit()
            
            # Log structured call
            log_agent_call(
                user_id=current_user.id,
                query=query,
                response=response_text,
                latency_ms=latency_ms,
                cache_hit=False,
                session_id=session.id
            )
        except Exception as e:
            db.rollback()
            yield f"\n[ERROR: {str(e)}]"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/sessions", response_model=List[Dict[str, Any]])
def get_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all chat sessions belonging to the current user.
    """
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc()).all()
    
    return [
        {"id": s.id, "title": s.title, "created_at": s.created_at} 
        for s in sessions
    ]

@router.get("/sessions/{session_id}/messages", response_model=List[Dict[str, Any]])
def get_session_messages(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all messages for a specific session.
    """
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão não encontrada"
        )
        
    return [
        {"role": m.role, "content": m.content, "timestamp": m.timestamp} 
        for m in session.messages
    ]

@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deletes a session and all its messages.
    """
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão não encontrada"
        )
        
    db.delete(session)
    db.commit()
    
    return {"status": "success", "message": "Sessão excluída com sucesso"}
