// src/audio.js — Synthetic Web Audio sound engine & MOB Chiptune Jukebox
let ctx = null;
let soundEnabled = true;
let musicPlaying = false;
let currentTrackIndex = 0;
let musicTimer = null;
let analyser = null;
let dataArray = null;

export function getAudioContext() {
  if (!soundEnabled) return null;
  if (!ctx && (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

export function toggleSound() {
  soundEnabled = !soundEnabled;
  if (!soundEnabled) stopMusic();
  return soundEnabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function getVisualizerData() {
  if (!analyser || !dataArray) return new Uint8Array(16);
  analyser.getByteFrequencyData(dataArray);
  return dataArray;
}

// ----------------- Sound Effects -----------------

export function playTick(pitch = 440) {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, pitch * 0.3), c.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.04);
  } catch {}
}

export function playGoodSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, c.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, c.currentTime + 0.1); // E5
    gain.gain.setValueAtTime(0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.12);
  } catch {}
}

export function playBadSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  } catch {}
}

export function playPerfectSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, c.currentTime + i * 0.05);
      gain.gain.setValueAtTime(0.1, c.currentTime + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.05 + 0.22);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + i * 0.05);
      osc.stop(c.currentTime + i * 0.05 + 0.22);
    });
  } catch {}
}

export function playRevealSting(tier = 1) {
  const c = getAudioContext();
  if (!c) return;
  try {
    const baseFreq = tier === 1 ? 440 : 330;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, c.currentTime + 0.35);
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.45);
  } catch {}
}

export const sfx = {
  tick: (pitch) => playTick(pitch),
  good: () => playGoodSound(),
  bad: () => playBadSound(),
  perfect: () => playPerfectSound(),
  revealSting: (tier) => playRevealSting(tier),
};

export function playPulseSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, c.currentTime + 0.06);
    gain.gain.setValueAtTime(0.06, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.06);
  } catch {}
}

export function playWardHit() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(580, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.12);
  } catch {}
}

export function playConvergencePulse() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  } catch {}
}

export function playCatchSound(rarity = 5) {
  const c = getAudioContext();
  if (!c) return;
  try {
    const baseFreq = { 1: 523.25, 2: 440, 3: 392, 4: 329.63, 5: 261.63 }[rarity] || 300;
    const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2];
    notes.forEach((freq, idx) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + idx * 0.07);
      gain.gain.setValueAtTime(0.12, c.currentTime + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + idx * 0.07 + 0.25);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + idx * 0.07);
      osc.stop(c.currentTime + idx * 0.07 + 0.25);
    });
  } catch {}
}

export function playMissSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.22);
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.22);
  } catch {}
}

export function playComboBreakSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.25);
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.25);
  } catch {}
}

// Battle & Combat FX
export function playAttackSound(weaponType = 'Blade') {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    if (weaponType === 'Blade') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, c.currentTime);
    } else if (weaponType === 'Bludgeon') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, c.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, c.currentTime);
    } else {
      // Magic
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1050, c.currentTime + 0.15);
      gain.gain.setValueAtTime(0.14, c.currentTime);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  } catch {}
}

export function playCritSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(659.25, c.currentTime);
    osc.frequency.setValueAtTime(880, c.currentTime + 0.06);
    osc.frequency.setValueAtTime(1318.51, c.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.3);
  } catch {}
}

export function playLevelUpSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((f, idx) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, c.currentTime + idx * 0.06);
      gain.gain.setValueAtTime(0.14, c.currentTime + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + idx * 0.06 + 0.25);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + idx * 0.06);
      osc.stop(c.currentTime + idx * 0.06 + 0.25);
    });
  } catch {}
}

export function playDojoHitSound() {
  const c = getAudioContext();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, c.currentTime);
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.08);
  } catch {}
}

// ----------------- MOB Chiptune Jukebox Engine -----------------

export const JUKEBOX_TRACKS = [
  {
    id: 'primal',
    title: 'Primal Beats (MOB Genesis)',
    name: 'Primal Beats',
    category: 'Genesis',
    key: 'C Major',
    scale: 'Pentatonic',
    bpm: 130,
    melody: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 392.0, 329.63, 293.66, 261.63, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
    bass: [130.81, 130.81, 164.81, 164.81, 174.61, 174.61, 196.0, 196.0],
  },
  {
    id: 'dungeon',
    title: 'Dungeon Depths (Loot Survivor)',
    name: 'Dungeon Depths',
    category: 'Survivor',
    key: 'G Minor',
    scale: 'Natural Minor',
    bpm: 110,
    melody: [196.0, 220.0, 246.94, 261.63, 293.66, 261.63, 246.94, 220.0, 196.0, 164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 293.66],
    bass: [98.0, 98.0, 110.0, 110.0, 123.47, 123.47, 130.81, 130.81],
  },
  {
    id: 'arena',
    title: 'Gauntlet Arena (Boss Battle)',
    name: 'Gauntlet Arena',
    category: 'Battle',
    key: 'E Minor',
    scale: 'Harmonic Minor',
    bpm: 145,
    melody: [329.63, 392.0, 440.0, 493.88, 523.25, 493.88, 440.0, 392.0, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0],
    bass: [164.81, 164.81, 196.0, 196.0, 220.0, 220.0, 246.94, 246.94],
  },
  {
    id: 'astral',
    title: 'Astral Singularity (Legendary Theme)',
    name: 'Astral Singularity',
    category: 'Astral',
    key: 'A Minor',
    scale: 'Dorian',
    bpm: 95,
    melody: [440.0, 523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 880.0, 783.99, 659.25],
    bass: [110.0, 130.81, 164.81, 196.0, 220.0, 196.0, 164.81, 130.81],
  },
];

export function startMusic(trackIndex = 0) {
  stopMusic();
  const c = getAudioContext();
  if (!c) return;

  currentTrackIndex = trackIndex % JUKEBOX_TRACKS.length;
  const track = JUKEBOX_TRACKS[currentTrackIndex];
  musicPlaying = true;

  let step = 0;
  const stepInterval = (60 / track.bpm / 2) * 1000;

  musicTimer = setInterval(() => {
    if (!musicPlaying) return;
    try {
      const now = c.currentTime;

      // Melody note
      const melFreq = track.melody[step % track.melody.length];
      const oscM = c.createOscillator();
      const gainM = c.createGain();
      oscM.type = 'triangle';
      oscM.frequency.setValueAtTime(melFreq, now);
      gainM.gain.setValueAtTime(0.07, now);
      gainM.gain.exponentialRampToValueAtTime(0.001, now + (stepInterval / 1000) * 0.9);
      oscM.connect(gainM);
      gainM.connect(analyser || c.destination);
      if (analyser) analyser.connect(c.destination);
      oscM.start(now);
      oscM.stop(now + (stepInterval / 1000) * 0.9);

      // Bass note (every 2 steps)
      if (step % 2 === 0) {
        const bassFreq = track.bass[(step / 2) % track.bass.length];
        const oscB = c.createOscillator();
        const gainB = c.createGain();
        oscB.type = 'sawtooth';
        oscB.frequency.setValueAtTime(bassFreq, now);
        gainB.gain.setValueAtTime(0.05, now);
        gainB.gain.exponentialRampToValueAtTime(0.001, now + (stepInterval / 1000) * 1.8);
        oscB.connect(gainB);
        gainB.connect(analyser || c.destination);
        oscB.start(now);
        oscB.stop(now + (stepInterval / 1000) * 1.8);
      }

      step++;
    } catch {}
  }, stepInterval);

  return currentTrackIndex;
}

export function stopMusic() {
  musicPlaying = false;
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function isMusicPlaying() {
  return musicPlaying;
}

export function getCurrentTrackIndex() {
  return currentTrackIndex;
}
