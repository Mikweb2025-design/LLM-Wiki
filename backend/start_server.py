#!/usr/bin/env python3
"""Start backend server"""
import uvicorn
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    from app.main import app
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")