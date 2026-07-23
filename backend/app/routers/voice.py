"""API Router per Voce (Speech-to-Text)"""
import io
import os
import tempfile
import subprocess
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

# Vosk model path
VOSK_MODEL_PATH = os.path.join(os.path.dirname(__file__), "../../models/vosk-model-it")

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Trascrive audio in testo usando Vosk (offline, italiano).
    Supporta vari formati audio (WebM, WAV, FLAC, AIFF, OGG).
    """
    temp_path = None
    wav_path = None
    try:
        # Leggi il contenuto del file
        audio_data = await file.read()
        original_filename = file.filename or "audio"
        ext = original_filename.split('.')[-1].lower() if '.' in original_filename else 'tmp'
        
        logger.info(f"Ricevuto file audio: {original_filename}, size: {len(audio_data)} bytes, type: {file.content_type}")
        
        # Salva in un file temporaneo
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(audio_data)
            temp_path = tmp.name
        
        logger.info(f"Salvato in temporaneo: {temp_path}")
        
        # Converti in WAV mono 16kHz se necessario
        wav_path = temp_path
        if ext not in ['wav']:
            wav_path = temp_path + ".wav"
            try:
                result = subprocess.run([
                    "ffmpeg", "-i", temp_path,
                    "-acodec", "pcm_s16le", 
                    "-ar", "16000", "-ac", "1",
                    wav_path, "-y"
                ], capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0:
                    logger.info(f"Conversione WAV riuscita: {wav_path}")
                else:
                    logger.warning(f"ffmpeg fallito: {result.stderr}")
                    wav_path = temp_path
            except Exception as e:
                logger.warning(f"Errore conversione: {e}")
                wav_path = temp_path
        
        # Usa Vosk per la trascrizione offline
        try:
            from vosk import Model, KaldiRecognizer
            import wave
            
            if not os.path.exists(VOSK_MODEL_PATH):
                raise Exception(f"Modello Vosk non trovato in {VOSK_MODEL_PATH}")
            
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
            
            # Estrai il testo dai risultati
            import json
            text_parts = []
            for res in results:
                data = json.loads(res)
                if 'text' in data and data['text']:
                    text_parts.append(data['text'])
            
            text = ' '.join(text_parts).strip()
            logger.info(f"Trascrizione Vosk: {text[:50]}...")
            
            return JSONResponse(content={"text": text, "success": True, "method": "vosk"})
            
        except ImportError:
            logger.error("Vosk non installato")
            raise HTTPException(status_code=500, detail="Vosk non installato")
        except Exception as e:
            logger.error(f"Errore Vosk: {e}")
            raise HTTPException(status_code=500, detail=f"Errore trascrizione: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore generico trascrizione: {e}")
        raise HTTPException(status_code=500, detail=f"Errore trascrizione: {str(e)}")
    finally:
        # Cleanup
        for f in [temp_path, wav_path]:
            if f and os.path.exists(f):
                try:
                    os.unlink(f)
                except:
                    pass
