from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

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
    # F22 #8 dual-auth secrets. Required so the service refuses to boot
    # unauthenticated — it is reachable from the public internet via nginx.
    #   JWT_SECRET            — HS256 secret shared with the TS services to verify
    #                           end-user Bearer tokens. The TS side enforces >=32
    #                           chars, so we mirror that floor here.
    #   INTERNAL_SERVICE_TOKEN — shared bearer for trusted server-to-server callers
    #                           (chat/exercise/plan/progress) via X-Internal-Token.
    JWT_SECRET: str = Field(..., min_length=32, env="JWT_SECRET")
    # min_length so an EMPTY token can't satisfy the required field: ai-pipeline
    # must fail fast (refuse to boot) when INTERNAL_SERVICE_TOKEN is unset, rather
    # than booting and then silently 401-ing every internal AI call (Ria / plan /
    # weekly-audit) from chat/exercise/plan/progress. Set it (>=16 chars) in
    # infra/docker/.env, matching the value the 4 caller services receive.
    INTERNAL_SERVICE_TOKEN: str = Field(..., min_length=16, env="INTERNAL_SERVICE_TOKEN")
    PROGRESS_SERVICE_URL: str = Field(default="http://localhost:3007", env="PROGRESS_SERVICE_URL")
    ALLOWED_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000", env="ALLOWED_ORIGINS")
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()
