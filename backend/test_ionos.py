import os
from pathlib import Path

BASE_DIR = Path('.').resolve()
env_file = BASE_DIR / '.env'

print(f"Searching .env at: {env_file}")
print(f"Exists: {env_file.exists()}")

IONOS_API_KEY = os.getenv("IONOS_API_KEY")
print(f"IONOS_API_KEY from env: {IONOS_API_KEY}")

if not IONOS_API_KEY and env_file.exists():
    print("Reading from .env file...")
    with open("backend/.env", "r") as f:
        for line in f:
            if line.startswith("IONOS_API_KEY="):
                IONOS_API_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                print(f"Read IONOS_API_KEY: {IONOS_API_KEY[:50]}...")
                break

print(f"Final IONOS_API_KEY: {IONOS_API_KEY}")
print(f"Length: {len(IONOS_API_KEY) if IONOS_API_KEY else 0}")
print(f"Starts with 'eyJ': {IONOS_API_KEY.startswith('eyJ') if IONOS_API_KEY else False}")

# Test
print("\n=== Test ===")
import requests
if IONOS_API_KEY:
    response = requests.post(
        "https://openai.inference.de-txl.ionos.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {IONOS_API_KEY}", "Content-Type": "application/json"},
        json={"model": "meta-llama/Llama-3.3-70B-Instruct", "messages": [{"role": "user", "content": "Ciao"}], "max_tokens": 30},
        timeout=10
    )
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
else:
    print("No IONOS_API_KEY")