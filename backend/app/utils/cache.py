"""TTL cache decorator semplice, thread-safe, senza dipendenze esterne."""
import time
import threading
from functools import wraps


def ttl_cache(seconds: float = 30.0, maxsize: int = 128):
    """Cache con time-to-live. Usa hash degli args (no kwargs complessi)."""
    def decorator(func):
        store: dict = {}
        lock = threading.Lock()

        @wraps(func)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            now = time.monotonic()
            with lock:
                hit = store.get(key)
                if hit and (now - hit[0]) < seconds:
                    return hit[1]
            # outside lock: compute (potentially slow)
            value = func(*args, **kwargs)
            with lock:
                if len(store) >= maxsize:
                    # evict oldest
                    oldest = min(store, key=lambda k: store[k][0])
                    store.pop(oldest, None)
                store[key] = (now, value)
            return value

        def cache_clear():
            with lock:
                store.clear()

        wrapper.cache_clear = cache_clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
