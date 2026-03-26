import { useState, useRef, useCallback, useEffect } from 'react';

type AmbientState = 'off' | 'listening' | 'speech_detected' | 'transcribing';

const SILENCE_TIMEOUT_MS = 10_000; // Auto-dismiss after 10s of silence
const SPEECH_THRESHOLD = 30; // RMS volume threshold (0-128 scale)
interface UseAmbientVoiceReturn {
  isAmbientActive: boolean;
  toggleAmbient: () => void;
  ambientState: AmbientState;
  currentTranscript: string;
  dismissTranscript: () => void;
  submitTranscript: () => string;
}

/** Continuous ambient listening with volume-based VAD. */
export function useAmbientVoice(): UseAmbientVoiceReturn {
  const [ambientState, setAmbientState] = useState<AmbientState>('off');
  const [currentTranscript, setCurrentTranscript] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  const isAmbientActive = ambientState !== 'off';

  const cleanup = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (speechEndTimerRef.current) clearTimeout(speechEndTimerRef.current);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    setAmbientState('off');
    setCurrentTranscript('');
  }, []);

  const startAmbient = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      // Set up Web Speech API for continuous transcription
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          if (text) {
            setCurrentTranscript(text);
            setAmbientState('speech_detected');
            lastSpeechTimeRef.current = Date.now();
          }
        };

        recognition.onerror = () => {};
        recognition.onend = () => {
          // Restart if still in ambient mode
          if (ambientState !== 'off' && recognitionRef.current) {
            try { recognition.start(); } catch (_) {}
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setAmbientState('listening');

      // Start volume monitoring (VAD)
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const monitorVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Compute RMS volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length) * 128;

        if (rms > SPEECH_THRESHOLD) {
          lastSpeechTimeRef.current = Date.now();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        animFrameRef.current = requestAnimationFrame(monitorVolume);
      };
      monitorVolume();

      // Auto-dismiss timer
      silenceTimerRef.current = setTimeout(() => {
        if (lastSpeechTimeRef.current === 0 || Date.now() - lastSpeechTimeRef.current > SILENCE_TIMEOUT_MS) {
          cleanup();
        }
      }, SILENCE_TIMEOUT_MS);
    } catch (err) {
      console.error('Ambient voice start failed:', err);
      cleanup();
    }
  }, [cleanup, ambientState]);

  const toggleAmbient = useCallback(() => {
    if (isAmbientActive) {
      cleanup();
    } else {
      startAmbient();
    }
  }, [isAmbientActive, cleanup, startAmbient]);

  const dismissTranscript = useCallback(() => {
    setCurrentTranscript('');
    setAmbientState('listening');
    lastSpeechTimeRef.current = 0;
  }, []);

  const submitTranscript = useCallback((): string => {
    const text = currentTranscript;
    setCurrentTranscript('');
    setAmbientState('listening');
    lastSpeechTimeRef.current = 0;
    return text;
  }, [currentTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    isAmbientActive,
    toggleAmbient,
    ambientState,
    currentTranscript,
    dismissTranscript,
    submitTranscript,
  };
}
