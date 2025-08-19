import { rng } from '../utils/random.js';
import { SR, parseSpecials } from './SpecialRules.js';

export class Rules {
	// ========= core helpers (OPR) =========
	// Quality Test: success on roll >= target; 1 always fails, 6 always succeeds. :contentReference[oaicite:2]{index=2}
	static test(need, mod = 0) {
		const r = rng.d6();
		const adj = r === 1 ? -999 : r === 6 ? 999 : r + mod;
		return { r, success: adj >= need };
	}
	static manyTests(n, need, mod = 0) {
		let succ = 0;
		const rolls = new Array(n);
		for (let i = 0; i < n; i++) {
			const t = this.test(need, mod);
			rolls[i] = t.r;
			if (t.success) succ++;
		}
		return { rolls, succ };
	}
	// Defense save: roll >= defense (after AP & cover etc). 6 always success, 1 always fail. :contentReference[oaicite:3]{index=3}
	static saves(n, need, mod = 0) {
		let saved = 0;
		const rolls = new Array(n);
		for (let i = 0; i < n; i++) {
			const t = this.test(need, mod);
			rolls[i] = t.r;
			if (t.success) saved++;
		}
		return { rolls, saved };
	}

	static isShootingCover(board, attacker, target) {
		// Cover if target tile is cover OR last tile before target along the line is cover
		if (board.isCover(target.x, target.y)) return true;
		const mid = board.lineTiles(attacker.x, attacker.y, target.x, target.y);
		if (mid.length) {
			const [px, py] = mid[mid.length - 1];
			if (board.isCover(px, py)) return true;
		}
		return false;
	}

	static hasSpecial(thing, name) {
		const arr = thing?.specials || [];
		return arr.some(
			(s) =>
				(typeof s === 'string' ? s : s?.name)?.toLowerCase() ===
				name.toLowerCase()
		);
	}

	static hasLineOfSight(board, attacker, target) {
		// Treat 'blocker' and 'cover' as LoS blockers in this grid version.
		const blockers = new Set(['blocker', 'cover']);
		const tiles = board.lineTiles(attacker.x, attacker.y, target.x, target.y);
		for (const [x, y] of tiles) {
			const kind = board.getTerrain(x, y);
			if (blockers.has(kind)) return false;
		}
		return true;
	}

	// ========= special rules evaluation (subset implemented per PDF) =========
	static normalizeSpecials(uOrW) {
		// attach parsed specials array once
		if (!uOrW) return;
		if (!uOrW.specialsParsed)
			uOrW.specialsParsed = parseSpecials(uOrW.specials || []);
		uOrW.specials = uOrW.specialsParsed;
	}

	// ========= attacks =========
	static canAttack(board, attacker, target) {
		if (!attacker || !target) return false;
		if (attacker.faction === target.faction) return false;
		const d = board.chebyshev(attacker, target); // diagonals adjacent
		// pick best weapon that reaches
		const weapon = attacker.bestWeaponForDistance(d);
		if (!weapon || weapon.range < d) return false;
		// LoS required unless weapon has Indirect
		if (
			!this.hasLineOfSight(board, attacker, target) &&
			!this.hasSpecial(weapon, 'Indirect')
		)
			return false;
		return true;
	}
	static pickWeapon(attacker, distance) {
		return attacker?.bestWeaponForDistance(distance) ?? null;
	}

	static resolveRanged(board, attacker, target, weapon) {
		this.normalizeSpecials(attacker);
		this.normalizeSpecials(weapon);
		const d = board.chebyshev(attacker, target);
		// to-hit mods
		let toHitMod = 0;
		if (SR.has(weapon, 'Reliable'))
			toHitMod = Math.max(toHitMod, 2 - attacker.quality); // Reliable: attacks at Q 2+ :contentReference[oaicite:4]{index=4}
		if (SR.has(weapon, 'Indirect')) toHitMod -= 1; // Indirect: -1 when moved (we don’t track moved here), but also ignores LoS/cover from blockers :contentReference[oaicite:5]{index=5}
		// Stealth: enemies shooting from >9” get -1 to hit; we treat tiles; if d>3 assume -1
		if (SR.has(target, 'Stealth') && d > 3) toHitMod -= 1; // :contentReference[oaicite:6]{index=6}
		// Fatigue in melee only; ranged unaffected.

		// number of attacks = weapon.hits
		const toHitTarget = SR.has(weapon, 'Reliable') ? 2 : attacker.quality;
		const { rolls: hitRolls, succ: hitsPre } = this.manyTests(
			weapon.hits,
			toHitTarget,
			toHitMod
		);

		// Blast(X): multiply hits up to X (capped to abstract “models nearby” as X here) :contentReference[oaicite:7]{index=7}
		const blastX = SR.blast(weapon);
		let hits = hitsPre * (blastX ? Math.max(1, blastX) : 1);

		// Defense saves
		let defMod = 0;
		const ap = SR.ap(weapon);
		defMod -= ap; // AP(X) lowers defense target :contentReference[oaicite:8]{index=8}
		const inCover = this.isShootingCover(board, attacker, target);
		if (inCover && !SR.has(weapon, 'Lock-On') && !SR.has(weapon, 'Indirect'))
			defMod += 1; // cover: +1 to defense vs shooting; Lock-On/Indirect ignore cover :contentReference[oaicite:9]{index=9}
		// Poison: defender re-rolls unmodified 6’s to save (handled by re-roll step) :contentReference[oaicite:10]{index=10}

		// First pass saves
		const defNeed = target.defense;
		let { rolls: saveRolls, saved } = this.saves(hits, defNeed, defMod);
		// Poison forces re-roll 6s: model re-rolls successful 6s; approximate by re-rolling half of successes
		if (SR.has(weapon, 'Poison')) {
			const toReRoll = Math.floor(saved * 0.5);
			if (toReRoll > 0) {
				const re = this.saves(toReRoll, target.defense, defMod);
				saved = saved - toReRoll + re.saved;
			}
		}
		let wounds = Math.max(0, hits - saved) * (weapon.dmg || 1);

		// Deadly(X): each wound gets multiplied per target model; we treat single model → multiply wounds directly :contentReference[oaicite:11]{index=11}
		const deadlyX = SR.deadly(weapon);
		if (deadlyX) wounds *= Math.max(1, deadlyX);

		// Relentless: on Hold + shooting, 6s to hit cause +1 hit; (engine lacks action context → skip unless you pass a flag) :contentReference[oaicite:12]{index=12}

		return {
			hits,
			saved,
			wounds,
			hitRolls,
			saveRolls,
			debug: {
				toHitTarget,
				toHitMod,
				defNeed,
				defMod,
				ap,
				blastX: blastX || 0,
			},
		};
	}

	static resolveMelee(
		board,
		attacker,
		target,
		weapon,
		opts = { charged: false, defenderStrikesBack: false }
	) {
		this.normalizeSpecials(attacker);
		this.normalizeSpecials(target);
		this.normalizeSpecials(weapon);
		// modifiers
		let toHitMod = 0;
		if (opts.charged && SR.has(attacker, 'Lance')) {
			toHitMod += 1;
		} // Lance on charge +1 to hit; AP handled as AP(+1) below :contentReference[oaicite:13]{index=13}
		// Fatigue: if attacker is fatigued and melee, only hits on unmodified 6 → emulate by ignoring mod and requiring natural 6
		const naturalSixOnly = !!attacker.fatigued;
		// Furious: unmodified 6s deal +1 extra hit :contentReference[oaicite:14]{index=14}
		const furious = SR.has(attacker, 'Furious');

		// base attacks
		let attacks = weapon.hits;
		// Impact(X): extra hits when charging (before melee), unless fatigued :contentReference[oaicite:15]{index=15}
		if (opts.charged && !attacker.fatigued) attacks += SR.impact(attacker);
		// Counter: defender strikes first; we handle turn order in GameState (not here) :contentReference[oaicite:16]{index=16}

		// roll to hit
		const toHitTarget = attacker.quality;
		let succ = 0;
		const hitRolls = new Array(attacks);
		for (let i = 0; i < attacks; i++) {
			const r = rng.d6();
			hitRolls[i] = r;
			const ok = naturalSixOnly
				? r === 6
				: r === 6 || (r !== 1 && r + toHitMod >= toHitTarget);
			if (ok) succ++;
			if (furious && r === 6) succ++; // extra hit
		}

		// Defense saves
		let defMod = 0;
		let ap = SR.ap(weapon);
		if (opts.charged && SR.has(attacker, 'Lance')) ap += 1; // Lance AP(+1) on charge :contentReference[oaicite:17]{index=17}
		defMod -= ap;
		const defNeed = target.defense;
		const { rolls: saveRolls, saved } = this.saves(succ, defNeed, defMod);
		let wounds = Math.max(0, succ - saved) * (weapon.dmg || 1);
		const deadlyX = SR.deadly(weapon);
		if (deadlyX) wounds *= Math.max(1, deadlyX);

		// Fear(X): counts as +X wounds when checking wound effects in melee (not damage) :contentReference[oaicite:18]{index=18}
		const fearX = SR.fear(attacker);

		return {
			hits: succ,
			saved,
			wounds,
			hitRolls,
			saveRolls,
			fearBonus: fearX,
			debug: { toHitTarget, toHitMod, defNeed, defMod, ap },
		};
	}

	// ========= wound effects & morale =========
	// When a model takes ≥1 wounds: add markers; roll 1d6 + markers: 1–5 Shaken, 6+ Knocked Out. Tough(X) delays & changes KO threshold. :contentReference[oaicite:19]{index=19}
	static applyWoundEffects(unit, rawWounds, fearBonus = 0) {
		if (rawWounds <= 0) return unit;
		const tough = SR.tough(unit) || 0;
		const newMarkers = unit.woundMarkers + rawWounds + fearBonus;
		// If below tough threshold, only accrue markers; don’t test yet
		if (newMarkers < Math.max(1, tough))
			return unit.clone({ woundMarkers: newMarkers });
		const roll = rng.d6() + newMarkers;
		const knocked = roll >= 6 + Math.max(0, tough - 1); // KO on 6+, shifted by Tough per PDF :contentReference[oaicite:20]{index=20}
		if (knocked) {
			// removed from play → handled by caller (filter out)
			return unit.clone({ woundMarkers: newMarkers });
		}
		// Shaken
		return unit.clone({
			woundMarkers: newMarkers,
			shaken: true,
			fatigued: true,
		});
	}

	static armyHalfOrLess(startUnits, currentUnits) {
		return currentUnits <= Math.ceil(startUnits / 2);
	}
}
