"""Modelli Pydantic per le API"""
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []
    model: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict]
    model: str


class UploadResponse(BaseModel):
    filename: str
    status: str
    chunks_added: int
    metadata: dict


class DocumentInfo(BaseModel):
    filename: str
    extension: str
    size_bytes: int
    modified: str
    created: str
    indexed: bool


class ScanResponse(BaseModel):
    scanned_files: int
    new_files: int
    already_indexed: int
    errors: List[str]


class ModelInfo(BaseModel):
    name: str
    available: bool


class SystemStatus(BaseModel):
    ollama_connected: bool
    available_models: List[str]
    current_model: str
    total_documents: int
    total_chunks: int
    # Opzionali — retrocompat: frontend vecchi continuano a funzionare.
    ionos_connected: Optional[bool] = None
    primary_provider: Optional[str] = None  # "ionos" | "ollama"
