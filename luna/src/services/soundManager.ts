// Minimal system sound manager using Web Audio API
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const ctx = getAudioCtx();
  if (!ctx || !soundEnabled) return;
  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playNotificationSound() {
  playTone(880, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(1100, 0.1, 'sine', 0.08), 100);
}

export function playSuccessSound() {
  playTone(523, 0.1, 'sine', 0.1);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 80);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.1), 160);
}

export function playErrorSound() {
  playTone(330, 0.2, 'square', 0.08);
  setTimeout(() => playTone(262, 0.3, 'square', 0.06), 150);
}

export function playAlertSound() {
  playTone(660, 0.12, 'triangle', 0.1);
  setTimeout(() => playTone(660, 0.12, 'triangle', 0.1), 200);
}
