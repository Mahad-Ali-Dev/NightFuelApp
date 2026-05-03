import httpx
from typing import Any
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.outputs import LLMResult
from .config import get_settings
from .logger import logger
import asyncio

class TokenTelemetryHandler(AsyncCallbackHandler):
    def __init__(self, user_id: str, action: str, provider: str):
        self.user_id = user_id
        self.action = action
        self.provider = provider
        self.settings = get_settings()
        
    async def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        try:
            prompt_tokens = 0
            completion_tokens = 0
            total_tokens = 0
            
            if response.llm_output and "token_usage" in response.llm_output:
                usage = response.llm_output["token_usage"]
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
                
            if total_tokens > 0:
                logger.info(f"Telemetry: User {self.user_id} used {total_tokens} tokens via {self.provider} for {self.action}")
                # We do this asynchronously to avoid blocking the user's critical path longer than needed
                asyncio.create_task(self._send_telemetry(prompt_tokens, completion_tokens, total_tokens))
                
        except Exception as e:
            logger.error(f"Telemetry Handler failed: {e}")

    async def _send_telemetry(self, prompt_tokens: int, completion_tokens: int, total_tokens: int):
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.settings.PROGRESS_SERVICE_URL}/v1/progress/ai-usage",
                    json={
                        "userId": self.user_id,
                        "action": self.action,
                        "provider": self.provider,
                        "promptTokens": prompt_tokens,
                        "completionTokens": completion_tokens,
                        "totalTokens": total_tokens
                    },
                    timeout=5.0
                )
        except Exception as e:
            logger.error(f"Failed to send POST telemetry to Progress Service: {e}")
