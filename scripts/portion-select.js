/**
 * SR Legacy portion selection (v1).
 *
 * 1. One candidate → use it
 * 2. Unique NLEA / mean serving weight label → use it
 * 3. Else score all (or explicit-label pool): energy-distance + penalties → lowest wins
 */
'use strict';

/** @typedef {{ seq: number, gram_weight: number, portion_description: string }} PortionCandidate */

const C_STAR = 150;
const RHO_REF = 225;
const RHO_FLOOR = 5;
const M_MIN = 30;
const M_MAX = 350;
const M_DRINK = 240;

const EXPLICIT_LABEL = /\bnlea\s+serving\b|mean serving weight/i;
const RETAIL_BULK = /\b(head|bunch|package|whole\s+fruit|\bfruit\b(?!\s+juice))\b/i;

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function portionText(p) {
  return String(p.portion_description || '').trim();
}

function energyDistanceLoss(m, kcalPer100g) {
  const rho = kcalPer100g || 0;
  const cal = (m / 100) * rho;
  const wCal = clamp(rho / RHO_REF, 0, 1);
  const wMass = 1 - wCal;

  const mTarget =
    rho > RHO_FLOOR
      ? clamp(C_STAR / (rho / 100), M_MIN, M_MAX)
      : M_DRINK;

  const massTerm = Math.pow(Math.log(m / mTarget), 2);
  const calTerm = Math.pow(Math.log((cal + 1) / (C_STAR + 1)), 2);
  return wMass * massTerm + wCal * calTerm;
}

function guardrailPenalty(p, siblings, kcalPer100g) {
  const m = p.gram_weight;
  const cal = (m / 100) * (kcalPer100g || 0);
  let penalty = 0;

  if (RETAIL_BULK.test(portionText(p).toLowerCase())) penalty += 100;
  if (cal > 800) penalty += 80 + (cal - 800) / 20;
  if (m > M_MAX) penalty += 60 + (m - M_MAX) / 10;
  if (m < 5 && siblings.some((s) => s.gram_weight >= 20)) penalty += 80;
  if (
    cal < 100 &&
    siblings.some((s) => {
      const sc = (s.gram_weight / 100) * (kcalPer100g || 0);
      return sc >= 120 && sc <= 500;
    })
  ) {
    penalty += 70;
  }

  return penalty;
}

function scorePortion(p, siblings, kcalPer100g) {
  return (
    energyDistanceLoss(p.gram_weight, kcalPer100g) +
    guardrailPenalty(p, siblings, kcalPer100g)
  );
}

function pickLowestLoss(candidates, kcalPer100g) {
  let best = null;
  for (const p of candidates) {
    const loss = scorePortion(p, candidates, kcalPer100g);
    if (!best || loss < best.loss) best = { p, loss };
  }
  return best.p;
}

/**
 * @param {PortionCandidate[]} candidates
 * @param {{ kcalPer100g?: number }} [ctx]
 * @returns {PortionCandidate}
 */
function pickBestPortion(candidates, ctx = {}) {
  const kcalPer100g = ctx.kcalPer100g || 0;
  const list = candidates.filter((p) => p.gram_weight > 0);
  if (!list.length) {
    return { seq: 999999, gram_weight: 100, portion_description: '100 g' };
  }
  if (list.length === 1) return list[0];

  const explicit = list.filter((p) => EXPLICIT_LABEL.test(portionText(p)));
  if (explicit.length === 1) return explicit[0];

  const pool = explicit.length > 1 ? explicit : list;
  return pickLowestLoss(pool, kcalPer100g);
}

module.exports = {
  pickBestPortion,
  scorePortion,
  energyDistanceLoss,
  guardrailPenalty,
  C_STAR,
  M_MAX,
};
