import sys
import logging
import json
import uuid
from datetime import datetime
from typing import Optional

from app.config import settings

# Setup the logger
logger = logging.getLogger("aura-observability")
logger.setLevel(logging.INFO)

class OTelJSONFormatter(logging.Formatter):
    """
    Format logs as JSON conforming to standard OpenTelemetry LogRecord structure.
    """
    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "Timestamp": datetime.utcnow().isoformat() + "Z",
            "SeverityText": record.levelname,
            "SeverityNumber": record.levelno,
            "Body": record.getMessage(),
            "Resource": {
                "service.name": "aura-investment-backend",
                "service.version": "1.0.0"
            },
            "Attributes": getattr(record, "attributes", {})
        }
        trace_id = getattr(record, "trace_id", None)
        span_id = getattr(record, "span_id", None)
        if trace_id:
            log_record["TraceId"] = trace_id
        if span_id:
            log_record["SpanId"] = span_id
        return json.dumps(log_record)

# Clean existing handlers to avoid double logging
if logger.hasHandlers():
    logger.handlers.clear()

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(OTelJSONFormatter())
logger.addHandler(handler)

# Initialize Langfuse v4 via get_client + OpenTelemetry
has_langfuse = False
langfuse_client = None
langfuse_tracer = None

try:
    if settings.LANGFUSE_PUBLIC_KEY and settings.LANGFUSE_SECRET_KEY:
        import os
        # Langfuse v4 reads keys from environment variables
        os.environ["LANGFUSE_PUBLIC_KEY"] = settings.LANGFUSE_PUBLIC_KEY
        os.environ["LANGFUSE_SECRET_KEY"] = settings.LANGFUSE_SECRET_KEY
        os.environ["LANGFUSE_HOST"] = settings.LANGFUSE_HOST

        from langfuse import get_client
        from opentelemetry import trace as otel_trace

        langfuse_client = get_client()
        langfuse_tracer = otel_trace.get_tracer("aura-investment-backend")
        has_langfuse = True
        logger.info("Langfuse v4 tracer initialized successfully.")
except Exception as e:
    sys.stderr.write(f"[Observability] Langfuse init failed: {e}\n")


def log_agent_call(
    user_id: int,
    query: str,
    response: str,
    latency_ms: float,
    cache_hit: bool = False,
    session_id: Optional[int] = None
) -> None:
    """
    Logs structured OTel-compatible information to stdout.
    """
    trace_id = uuid.uuid4().hex
    span_id = uuid.uuid4().hex[16:]

    # Structured stdout logging
    extra = {
        "trace_id": trace_id,
        "span_id": span_id,
        "attributes": {
            "user.id": user_id,
            "chat.query": query,
            "chat.response": response[:200] + "..." if len(response) > 200 else response,
            "chat.latency_ms": latency_ms,
            "chat.cache_hit": cache_hit,
            "chat.session_id": session_id,
        }
    }
    logger.info(f"Agent Chat Call - User {user_id} - Session {session_id}", extra=extra)
