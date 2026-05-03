from fastapi import HTTPException
from redis.asyncio import Redis
from .config import get_settings
from .logger import logger

settings = get_settings()

# We initialize a single connection pool for the lifespan of the app
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

async def check_rate_limit(user_id: str, limit: int = 20, window_seconds: int = 86400):
    """
    Enforces a strict daily API quota per user using Redis.
    Uses a fixed window strategy (starts counting from the first request).
    """
    if not user_id:
        logger.warning("Rate limit skipped: No user_id provided.")
        return 0
        
    key = f"rate_limit:ai:{user_id}"
    
    try:
        # Atomic increment
        count = await redis_client.incr(key)
        
        # If it's the first request in the window, set the expiration
        if count == 1:
            await redis_client.expire(key, window_seconds)
            
        if count > limit:
            logger.warning(f"Rate limit exceeded for user {user_id}: {count}/{limit}")
            raise HTTPException(
                status_code=429, 
                detail=f"Daily AI request limit exceeded ({limit}/day). Please try again tomorrow."
            )
            
        logger.info(f"AI Quota for user {user_id}: {count}/{limit} used.")
        return count
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Redis rate limit check failed: {str(e)}. Permitting request as fallback.")
        # Fail open so users aren't locked out if Redis blips, but log the error
        return 0
