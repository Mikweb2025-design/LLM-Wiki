import os
from pathlib import Path

# Usa Path relativo corretto
BASE_DIR = Path(__file__).parent.resolve()
print(f"BASE_DIR: {BASE_DIR}")
print(f"Dir contents: {list(BASE_DIR.glob('*'))}")

env_file = BASE_DIR / '.env'
print(f"env_file: {env_file}")
print(f"exists: {env_file.exists()}")

if env_file.exists():
    with open(env_file, "r") as f:
        print("File content:")
        print(f.read())  # Mostra contenuto completo