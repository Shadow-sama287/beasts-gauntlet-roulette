// src/ui/cardModal.js — Interactive 3D Holographic Tilt Beast Card Inspector
import { TIER_NAMES, TIER_COLORS } from '../roulette.js';
import { handleArtError, artForBeast } from '../beastLoader.js';
import { SEPOLIA } from '../onchain.js';

let activeModal = null;

export function openCardModal(beast, { isCaught = true, isDiscovered = false, isCompanion = false, isOwnedOnchain = false, friendliness = 10, onSelectCompanion } = {}) {
  closeCardModal();

  const isRevealed = isCaught || isDiscovered;
  const tier = beast.tier || beast.rarity || 5;
  const tierColor = TIER_COLORS[tier] || '#f2f2f2';
  const tierName = TIER_NAMES[tier] || 'Common';
  const combatType = beast.type || (tier % 3 === 0 ? 'Brute' : tier % 3 === 1 ? 'Magical' : 'Hunter');
  const typeIcons = { Magical: 'Magical', Hunter: 'Hunter', Brute: 'Brute' };
  const advantages = {
    Magical: 'Strong vs Brute (+50%) · Weak vs Hunter',
    Hunter: 'Strong vs Magical (+50%) · Weak vs Brute',
    Brute: 'Strong vs Hunter (+50%) · Weak vs Magical',
  };

  // Single source of truth for stats across Card & Modal
  const level = beast.level || (tier === 1 ? 55 : tier === 2 ? 38 : tier === 3 ? 24 : tier === 4 ? 14 : 5);
  const power = beast.power || (level * (6 - tier));
  const health = beast.health || (100 + tier * 25);

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'beast-card-modal';

  const explorerUrl = `https://sepolia.starkscan.co/nft/${SEPOLIA.nft}/${beast.tokenId || beast.id}`;

  modalOverlay.innerHTML = `
    <div class="modal-card-wrap">
      <div class="holo-card ${isOwnedOnchain ? 'owned-glow' : ''}" id="holo-card" style="border-color:${isCaught ? tierColor : isDiscovered ? '#5b658a' : '#3a3a4c'}; box-shadow: 0 0 ${isOwnedOnchain ? '45px #f5c542' : isCaught ? `35px ${tierColor}44` : isDiscovered ? '25px rgba(100,150,255,0.25)' : '20px rgba(0,0,0,0.8)'};">
        <div class="holo-shimmer" id="holo-shimmer"></div>
        <button class="modal-close-btn" id="modal-close" title="Close (Esc)">✕</button>

        <div class="holo-art-frame">
          <img src="${beast.art || artForBeast(beast.id) || `/beasts/art/${beast.id}.svg`}" alt="${isRevealed ? beast.name : '???'}" class="holo-art-img ${!isRevealed ? 'silhouette' : ''}" />
          ${!isRevealed ? '<div class="locked-question-mark">?</div>' : ''}
        </div>

        <!-- Badges positioned cleanly below art frame, never obstructing card artwork -->
        <div class="holo-badge-row" style="margin-top:10px; display:flex; justify-content:center; gap:6px; flex-wrap:wrap;">
          ${
            isCaught
              ? `
                <span class="holo-badge" style="background:${tierColor}; color:#000; font-weight:bold; padding:2px 8px; border-radius:12px; font-size:0.7rem;">T${tier} ${tierName.toUpperCase()}</span>
                ${(beast.isArtathon || Number(beast.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.65rem; padding:2px 6px;">ARTATHON SUBMISSION</span>' : ''}
                ${beast.isOnchain ? '<span class="onchain-pill-badge" style="font-size:0.65rem; padding:2px 6px;">ONCHAIN</span>' : '<span class="sigil-pill-badge" style="font-size:0.65rem; padding:2px 6px;">LOCAL</span>'}
                ${isOwnedOnchain ? '<span class="owned-pill-badge" style="background:#f5c542; color:#000; font-weight:800; padding:2px 8px; border-radius:12px; font-size:0.65rem;">OWNED NFT</span>' : ''}
              `
              : isDiscovered
              ? `
                <span class="holo-badge" style="background:${tierColor}; color:#000; font-weight:bold; padding:2px 8px; border-radius:12px; font-size:0.7rem;">T${tier} ${tierName.toUpperCase()}</span>
                <span class="discovered-pill-badge" style="padding:2px 8px; border-radius:12px; font-size:0.68rem;">DISCOVERED IN GAUNTLET</span>
                ${(beast.isArtathon || Number(beast.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.65rem; padding:2px 6px;">ARTATHON SUBMISSION</span>' : ''}
              `
              : `
                <span class="badge-tag" style="background:#1d1b28; color:var(--muted); font-size:0.72rem;">[LOCKED] UNDISCOVERED SPECIES</span>
                ${(beast.isArtathon || Number(beast.id) >= 10000) ? '<span class="artathon-pill-badge" style="font-size:0.65rem; padding:2px 6px;">ARTATHON SUBMISSION</span>' : ''}
              `
          }
        </div>

        <div class="holo-info" style="margin-top:8px;">
          <h2 class="holo-title" style="font-size:1.3rem;">${isRevealed ? (beast.prefix ? `${beast.prefix} ` : '') + beast.name : '???'}</h2>
          
          ${
            isCaught
              ? `
                <div class="holo-type" style="color:${tierColor}; font-weight:bold; margin-top:2px;">${typeIcons[combatType] || combatType}</div>
                <div class="holo-advantage" style="font-size:0.75rem; color:var(--muted); margin-top:2px;">${advantages[combatType] || ''}</div>
                
                <!-- Friendliness Stat & Gauntlet Boosts -->
                <div class="holo-friendliness-box" style="margin-top:8px; padding:8px 10px; background:rgba(255, 94, 148, 0.1); border:1px solid rgba(255, 94, 148, 0.35); border-radius:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
                    <span style="color:#ff5e94; font-weight:bold;">♥ FRIENDLINESS BOND:</span>
                    <strong class="num" style="color:#ff5e94; font-size:0.95rem;">${friendliness}%</strong>
                  </div>
                  <div class="meter-track" style="height:5px; margin-top:4px;">
                    <div class="meter-fill" style="width:${Math.min(100, friendliness)}%; background:#ff5e94;"></div>
                  </div>
                  <div style="font-size:0.7rem; color:var(--muted); margin-top:4px; display:flex; justify-content:space-between;">
                    <span>Atk Boost: <strong style="color:var(--gold);">+${friendliness}%</strong></span>
                    <span>Def Guard: <strong style="color:var(--good);">${Math.round(friendliness * 0.4)}%</strong></span>
                  </div>
                </div>

                <div class="holo-meta-row" style="margin-top:8px; display:flex; justify-content:space-between; font-size:0.8rem; background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:6px;">
                  <div><strong>Species:</strong> <span class="num">#${beast.id}</span></div>
                  <div><strong>Status:</strong> <span style="color:var(--good); font-weight:bold;">TAMED</span></div>
                </div>
                
                <div class="holo-meta-row" style="margin-top:6px; display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; text-align:center; font-size:0.78rem;">
                  <div style="background:var(--panel-2); padding:4px; border-radius:6px; border:1px solid var(--line);"><span style="color:var(--muted); font-size:0.7rem;">LEVEL</span><br><strong class="num">${level}</strong></div>
                  <div style="background:var(--panel-2); padding:4px; border-radius:6px; border:1px solid var(--line);"><span style="color:var(--muted); font-size:0.7rem;">POWER</span><br><strong class="num" style="color:var(--gold);">${power}</strong></div>
                  <div style="background:var(--panel-2); padding:4px; border-radius:6px; border:1px solid var(--line);"><span style="color:var(--muted); font-size:0.7rem;">HEALTH</span><br><strong class="num" style="color:var(--bad);">${health}</strong></div>
                </div>
              `
              : isDiscovered
              ? `
                <div class="holo-type" style="color:${tierColor}; font-weight:bold; margin-top:2px;">${typeIcons[combatType] || combatType}</div>
                <div class="holo-advantage" style="font-size:0.75rem; color:var(--muted); margin-top:2px;">${advantages[combatType] || ''}</div>
                
                <div class="holo-meta-row" style="margin-top:8px; display:flex; justify-content:space-between; font-size:0.8rem; background:rgba(100,150,255,0.08); padding:6px 10px; border-radius:6px;">
                  <div><strong>Species:</strong> <span class="num">#${beast.id}</span></div>
                  <div><strong>Status:</strong> <span style="color:#7da5ff; font-weight:bold;">DISCOVERED (Untamed)</span></div>
                </div>

                <p style="font-size:0.78rem; color:var(--muted); margin:10px 0; text-align:center; line-height:1.4;">
                  Discovered during your Gauntlet adventures! To recruit ${beast.name} as a companion and build its Friendliness bond, spin and tame it in the Roulette Wheel.
                </p>
              `
              : `
                <p style="font-size:0.8rem; color:var(--muted); margin:12px 0; text-align:center;">
                  ${(beast.isArtathon || Number(beast.id) >= 10000)
                    ? 'Official Starknet Beasts Artathon community submission. Defeat in the Gauntlet or tame in the Roulette Wheel to reveal species name, lore, and stats.'
                    : 'Defeat in the Gauntlet or tame in the Roulette Wheel to reveal species lore, type advantage, and stats.'
                  }
                </p>
              `
          }

          <div class="holo-actions" style="margin-top:14px;">
            ${
              isCaught
                ? `<button id="btn-equip-comp" class="btn-primary arcade-btn" style="width:100%; height:46px; font-size:0.92rem;">
                    ${isCompanion ? '★ Current Active Companion' : 'Set as Gauntlet Companion'}
                  </button>`
                : isDiscovered
                ? `<button class="btn-ghost" disabled style="width:100%; height:46px; font-size:0.85rem; color:var(--muted); border:1px dashed var(--line); cursor:default;">
                    Tame via Roulette to Recruit
                  </button>`
                : ''
            }
            <div style="display:flex; justify-content:center; gap:12px; margin-top:10px;">
              <a href="https://beasts.app/#/beast/${beast.id}" target="_blank" rel="noopener" class="beasts-app-link" style="color:var(--muted); font-size:0.75rem;">
                beasts.app ↗
              </a>
              <a href="${explorerUrl}" target="_blank" rel="noopener" class="beasts-app-link" style="color:var(--gold); font-size:0.75rem;">
                Sepolia Starkscan ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);
  activeModal = modalOverlay;

  const card = modalOverlay.querySelector('#holo-card');
  const shimmer = modalOverlay.querySelector('#holo-shimmer');
  const img = modalOverlay.querySelector('.holo-art-img');
  if (img) img.onerror = () => handleArtError(img, beast);

  // Interactive 3D tilt tracking
  function handleMouseMove(e) {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    const shimmerX = (x / rect.width) * 100;
    const shimmerY = (y / rect.height) * 100;
    shimmer.style.background = `radial-gradient(circle at ${shimmerX}% ${shimmerY}%, rgba(255,255,255,0.35) 0%, transparent 60%)`;
  }

  function handleMouseLeave() {
    card.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg)';
    shimmer.style.background = 'none';
  }

  card.addEventListener('mousemove', handleMouseMove);
  card.addEventListener('mouseleave', handleMouseLeave);

  // Equip companion button
  const equipBtn = modalOverlay.querySelector('#btn-equip-comp');
  if (equipBtn) {
    equipBtn.onclick = () => {
      if (onSelectCompanion) onSelectCompanion(beast);
      closeCardModal();
    };
  }

  // Close handlers
  modalOverlay.querySelector('#modal-close').onclick = closeCardModal;
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeCardModal();
  };
}

export function closeCardModal() {
  if (activeModal) {
    activeModal.remove();
    activeModal = null;
  }
}
