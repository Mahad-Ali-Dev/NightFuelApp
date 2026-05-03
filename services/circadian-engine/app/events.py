import os
import json
import asyncio
import redis.asyncio as redis
import uuid
from datetime import datetime
from .models import Shift, compute_profile
from .logger import logger

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

async def handle_shift_stream_event(stream: str, message_id: str, event_str: str, redis_client: redis.Redis, group: str) -> None:
    try:
        data = json.loads(event_str)
        payload = data.get("payload", {})

        shift = Shift(
            id=payload.get("id", "unknown"),
            userId=payload.get("userId", "unknown"),
            shiftDate=payload.get("shiftDate", datetime.utcnow().strftime("%Y-%m-%d")),
            startTime=payload.get("startTime", f"{datetime.utcnow().strftime('%Y-%m-%d')}T22:00:00Z"),
            endTime=payload.get("endTime", f"{datetime.utcnow().strftime('%Y-%m-%d')}T06:00:00Z"),
            shiftType=payload.get("shiftType", "FIXED_NIGHT"),
            workIntensity=payload.get("workIntensity", "MODERATE"),
            commuteMinutes=payload.get("commuteMinutes", 30),
            isDayOff=payload.get("isDayOff", False),
        )

        logger.info("Received shift stream event", extra={"shift_id": shift.id, "user_id": shift.userId, "id": message_id})
        profile = compute_profile(shift)

        # Publish result (Keep Pub/Sub for result if needed, but Streams for durability is better)
        event_payload = {
            "eventId": str(uuid.uuid4()),
            "eventType": "circadian.profile.computed",
            "producedAt": datetime.utcnow().isoformat() + "Z",
            "producerService": "circadian-engine",
            "correlationId": data.get("correlationId", str(uuid.uuid4())),
            "userId": shift.userId,
            "payload": profile.model_dump(),
        }

        # Dual-publish result for durability
        serialized_event = json.dumps(event_payload)
        output_stream = "nightfuel:circadian:profile-computed"
        await redis_client.publish(output_stream, serialized_event)
        await redis_client.xadd(output_stream, {"event": serialized_event})
        
        # Acknowledge the input message
        await redis_client.xack(stream, group, message_id)
        logger.info("Processed and acknowledged shift event", extra={"shift_id": shift.id})

    except Exception as e:
        logger.error("Error handling shift stream event", extra={"error": str(e), "id": message_id})

async def start_event_listener() -> None:
    retry_delay = 2
    group = "circadian-engine"
    consumer = f"{group}-consumer-{uuid.uuid4()}"
    streams = ["nightfuel:shift:shift-created", "nightfuel:shift:shift-updated"]
    
    while True:
        try:
            redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            
            # Ensure consumer groups exist
            for s in streams:
                try:
                    await redis_client.xgroup_create(s, group, id="$", mkstream=True)
                except redis.ResponseError as e:
                    if "BUSYGROUP" not in str(e):
                        logger.error(f"Error creating group for {s}: {e}")

            logger.info("Subscribed to Redis shift streams", extra={"group": group, "streams": streams})
            retry_delay = 2

            while True:
                # Read from streams with 5s blocking
                results = await redis_client.xreadgroup(group, consumer, {s: ">" for s in streams}, count=1, block=5000)
                if results:
                    for stream_name, messages in results:
                        for message_id, message_data in messages:
                            event_str = message_data.get("event")
                            if event_str:
                                await handle_shift_stream_event(stream_name, message_id, event_str, redis_client, group)
                
        except (redis.ConnectionError, redis.TimeoutError) as e:
            logger.error(f"Redis connection lost, retrying in {retry_delay}s", extra={"error": str(e)})
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)
        except Exception as e:
            logger.error(f"Unexpected error in event listener: {e}")
            await asyncio.sleep(retry_delay)

def run_listener() -> None:
    loop = asyncio.get_running_loop()
    loop.create_task(start_event_listener())
