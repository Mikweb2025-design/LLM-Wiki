"""API Router per Voce (Speech-to-Text)"""
import io
import os
import json
import tempfile
import subprocess
import wave
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

VOSK_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../models/vosk-model-it")


def _convert_to_wav(input_path: str, ext: str) -> str:
    """Converti audio in WAV mono 16kHz con ffmpeg."""
    wav_path = input_path + ".wav"
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", input_path, "-acodec", "pcm_s16le",
             "-ar", "16000", "-ac", "1", wav_path, "-y"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            logger.info(f"Conversione WAV OK: {wav_path}")
            return wav_path
        logger.warning(f"ffmpeg errore: {result.stderr[:300]}")
    except FileNotFoundError:
        logger.error("ffmpeg non installato")
    except Exception as e:
        logger.warning(f"Errore conversione: {e}")
    return input_path


def _vosk_transcribe(wav_path: str) -> str:
    """Trascrivi WAV con Vosk."""
    from vosk import Model, KaldiRecognizer

    if not os.path.exists(VOSK_MODEL_PATH):
        raise Exception(f"Modello Vosk non trovato: {VOSK_MODEL_PATH}")

    model = Model(VOSK_MODEL_PATH)
    wf = wave.open(wav_path, "rb")
    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)

    results = []
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            results.append(rec.Result())
    results.append(rec.FinalResult())
    wf.close()

    text_parts = []
    for res in results:
        d = json.loads(res)
        if d.get("text"):
            text_parts.append(d["text"])
    return " ".join(text_parts).strip()


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Trascrive audio in testo usando Vosk (offline, italiano)."""
    temp_path = None
    wav_path = None
    try:
        audio_data = await file.read()
        if len(audio_data) < 100:
            raise HTTPException(status_code=400, detail="Audio troppo corto o vuoto")

        # Determina estensione: prima dal filename, poi dal content_type
        ext = None
        if file.filename and "." in file.filename:
            ext = file.filename.rsplit(".", 1)[-1].lower()
        if not ext or ext == "audio":
            ct = (file.content_type or "").lower()
            if "webm" in ct: ext = "webm"
            elif "mp4" in ct or "m4a" in ct: ext = "m4a"
            elif "ogg" in ct: ext = "ogg"
            elif "wav" in ct: ext = "wav"
            elif "flac" in ct: ext = "flac"
            else: ext = "webm"

        logger.info(f"Audio ricevuto: {len(audio_data)} bytes, ext=.{ext}, type={file.content_type}")

        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(audio_data)
            temp_path = tmp.name

        # Converti in WAV se necessario
        wav_path = temp_path if ext == "wav" else _convert_to_wav(temp_path, ext)

        text = _vosk_transcribe(wav_path)
        logger.info(f"Trascrizione: {text[:80]}...")
        return JSONResponse(content={"text": text, "success": True, "method": "vosk"})

    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=500, detail="Vosk non installato")
    except Exception as e:
        logger.error(f"Errore trascrizione: {e}")
        raise HTTPException(status_code=500, detail=f"Errore trascrizione: {str(e)}")
    finally:
        for f in [temp_path, wav_path]:
            if f and f != temp_path and os.path.exists(f):
                try: os.unlink(f)
                except: pass
        if temp_path and os.path.exists(temp_path):
            try: os.unlink(temp_path)
            except: pass
