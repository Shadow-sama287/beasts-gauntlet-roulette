// src/minigames/types.js (JSDoc only)
/**
 * @typedef {'Magical'|'Hunter'|'Brute'} BeastType
 * @typedef {{ success:boolean, grade:'miss'|'graze'|'hit'|'perfect', score:number }} TameResult
 * @typedef {Object} MiniGameCtx
 * @property {HTMLElement} mount            container inside the fixed card slot area
 * @property {{ id:string, name:string, type:BeastType, tier:1|2|3|4|5, rarity?:number, art?:string }} beast
 * @property {() => number} rng             seeded, from mulberry32
 * @property {{ difficulty:number, latencyMs:number }} settings   difficulty default 1.0
 * @property {Object} sfx                   wrapper over audio.js
 * @property {(r:TameResult) => void} finish
 * @typedef {Object} MiniGame
 * @property {string} id
 * @property {string} title                 shown on the intro card
 * @property {string} blurb                 one short line explaining the goal
 * @property {string} controls              e.g. "Click / tap to throw"
 * @property {number[]} tiers               tiers this game may appear in
 * @property {Record<BeastType, number>} weights   pick weight per beast type
 * @property {(ctx:MiniGameCtx) => Promise<{destroy:()=>void}> | {destroy:()=>void}} mount
 */
