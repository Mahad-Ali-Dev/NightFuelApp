from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
import os

class Settings(BaseSettings):
    AI_PIPELINE_PORT: int = Field(default=8000, env="AI_PIPELINE_PORT")
    PORT: int = Field(default=3004, env="PORT")
    LOG_LEVEL: str = Field(default="info", env="LOG_LEVEL")
    # Default to a placeholder so the service boots with only ONE provider key
    # set (or none → demo mode). The chains treat a placeholder as "provider
    # unavailable" and rely on cross-provider fallback / demo output. Previously
    # these were required (Field(...)) and a missing key crashed startup.
    ANTHROPIC_API_KEY: str = Field(default="mock-key", env="ANTHROPIC_API_KEY")
    OPENAI_API_KEY: str = Field(default="mock-key", env="OPENAI_API_KEY")
    REDIS_URL: str = Field(..., env="REDIS_URL")
    PROGRESS_SERVICE_URL: str = Field(default="http://localhost:3007", env="PROGRESS_SERVICE_URL")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000", env="ALLOWED_ORIGINS")
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
