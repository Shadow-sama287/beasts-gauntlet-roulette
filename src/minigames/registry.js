// src/minigames/registry.js
import { netToss } from './games/netToss.js';
import { runeEcho } from './games/runeEcho.js';
import { dodgeStrike } from './games/dodgeStrike.js';
import { tugStruggle } from './games/tugStruggle.js';
import { sparkCatch } from './games/sparkCatch.js';
import { runeTrace } from './games/runeTrace.js';
import { heartbeat } from './games/heartbeat.js';
import {
  classicTimingBar,
  classicFocusRing,
  classicMovingBar,
  classicDualLock,
  classicConvergence,
} from './games/classics.js';

export const MINIGAMES = [
  netToss,
  runeEcho,
  dodgeStrike,
  tugStruggle,
  sparkCatch,
  runeTrace,
  heartbeat,
  classicTimingBar,
  classicFocusRing,
  classicMovingBar,
  classicDualLock,
  classicConvergence,
];

export function getGameById(id) {
  return MINIGAMES.find((g) => g.id === id) || null;
}
