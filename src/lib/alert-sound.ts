"use client";

// Synthesized via the Web Audio API rather than an audio file — nothing to
// ship or license for a two-tone beep.
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();

    // Browsers suspend a freshly created AudioContext until a user gesture
    // — resume it on the first click/keypress so the alert isn't silently
    // swallowed if it fires before anyone has interacted with the page.
    const unlock = () => {
      audioContext?.resume();
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
  }

  return audioContext;
}

function beep(ctx: AudioContext, startTime: number, frequency: number, duration: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// A short, urgent double-beep — played once per silo that newly crosses
// into critical, not on every poll while it stays critical.
export function playCriticalAlert() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  beep(ctx, now, 880, 0.18);
  beep(ctx, now + 0.22, 880, 0.18);
}
