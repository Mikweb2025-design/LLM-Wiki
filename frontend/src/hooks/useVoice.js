import { useState, useRef, useCallback } from 'react';
import { voiceApi } from '../utils/api';

export function useVoice(onTranscriptionComplete) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const options = { mimeType: 'audio/webm;codecs=opus' };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        try {
          console.log('[VOICE] Invio audio per trascrizione...');
          const response = await voiceApi.transcribe(audioBlob);
          const text = response.data?.text || '';
          
          console.log('[VOICE] Trascrizione ricevuta:', text);
          
          if (text && text.trim()) {
            onTranscriptionComplete(text.trim());
          } else {
            console.warn('[VOICE] Trascrizione vuota');
          }
        } catch (error) {
          console.error('[VOICE] Errore:', error.response?.data || error.message);
        }
        setIsProcessing(false);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (error) {
      console.error('[VOICE] Errore microfono:', error);
      alert('Errore accesso al microfono. Controlla i permessi del browser.');
    }
  }, [onTranscriptionComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording
  };
}
