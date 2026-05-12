# @forkd/queue

BullMQ job definitions, queue setup, and worker processors for Forkd. Backed by the Redis container. Houses the social-media import pipeline worker (Playwright → yt-dlp → ffmpeg → Whisper → Claude → draft restaurant) described in §8 of `docs/master-requirements.md`, and the scheduled backup worker described in §11. The BullMQ client is shared from here so `@forkd/api` can enqueue jobs without depending on the worker internals.
