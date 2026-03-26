import { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
}

/** Animated waveform bars driven by the audio analyser. */
export function VoiceWaveform({ analyserNode, isRecording }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!analyserNode || !isRecording || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barCount = 24;

    const draw = () => {
      analyserNode.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / barCount;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] / 255;
        const barHeight = Math.max(4, value * canvas.height * 0.8);
        const x = i * barWidth + barWidth * 0.15;
        const y = (canvas.height - barHeight) / 2;
        const w = barWidth * 0.7;

        ctx.fillStyle = `hsla(28, 60%, ${50 + value * 30}%, ${0.6 + value * 0.4})`;
        ctx.beginPath();
        ctx.roundRect(x, y, w, barHeight, 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isRecording]);

  if (!isRecording) return null;

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      style={{
        display: 'block',
        borderRadius: '6px',
      }}
    />
  );
}
