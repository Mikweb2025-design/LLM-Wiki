import { useState, useRef, useCallback } from 'react';
import { voiceApi } from '../utils/api';

const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
];

function getSupportedMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

function extFromMime(mime) {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export function useVoice(onTranscriptionComplete) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const mimeRef = useRef(null);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const mime = getSupportedMime();
    if (!mime) {
      alert('Nessun formato audio supportato dal browser. Prova Chrome o Firefox.');
      return;
    }
    mimeRef.current = mime;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('[VOICE] Errore microfono:', err);
      alert('Errore accesso al microfono. Controlla i permessi del browser.');
      return;
    }

    streamRef.current = stream;

    try {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const ext = extFromMime(mime);
        const audioBlob = new Blob(chunksRef.current, { type: mime });

        try {
          console.log(`[VOICE] Audio: ${audioBlob.size} bytes, mime=${mime}, ext=.${ext}`);
          const response = await voiceApi.transcribe(audioBlob, ext);
          const text = response.data?.text || '';
          console.log('[VOICE] Trascrizione:', text);
          if (text.trim()) {
            onTranscriptionComplete(text.trim());
          } else {
            console.warn('[VOICE] Trascrizione vuota');
          }
        } catch (error) {
          console.error('[VOICE] Errore trascrizione:', error.response?.data || error.message);
        } finally {
          setIsProcessing(false);
          cleanupStream();
        }
      };

      mediaRecorder.onerror = (e) => {
        console.error('[VOICE] MediaRecorder errore:', e.error);
        setIsRecording(false);
        setIsProcessing(false);
        cleanupStream();
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error('[VOICE] Errore MediaRecorder:', err);
      cleanupStream();
      alert('Errore avvio registrazione: ' + err.message);
    }
  }, [onTranscriptionComplete, cleanupStream]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setIsRecording(false);
    }
  }, []);

  return { isRecording, isProcessing, startRecording, stopRecording };
}
