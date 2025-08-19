import { Unit } from '../entities/Unit.js';
import { Rules } from '../rules/Rules.js';

let ID_SEQ = 1;
const nextId = () => ID_SEQ++;

export class GameState {
	constructor(
		board,
		units,
		activeFaction = 'A',
		turn = 1,
		selectedId = null,
		events = [],
		armies = { A: null, B: null },
		startCount = { A: 0, B: 0 }
	) {
		this.board = board;
		this.units = units;
		this.activeFaction = activeFaction;
		this.turn = turn;
		this.selectedId = selectedId;
		this.events = events;
		this.armies = armies;
		this.startCount = startCount;
	}

	// NEW: start a game from two army JSONs (with weapons)
	static initialFromArmies(board, armyA, armyB) {
		ID_SEQ = 1;
		const expand = (army, faction) => {
			const out = [];
			for (const t of army?.units ?? []) {
				const n = Math.max(1, t.count ?? 1);
				for (let i = 0; i < n; i++) {
					out.push(
						new Unit({
							id: nextId(),
							faction,
							x: 0,
							y: 0,
							hp: t.hp,
							maxHp: t.hp,
							move: t.move,
							quality: t.quality ?? 4,
							defense: t.defense ?? 4,
							type: t.type,
							image: t.image,
							weapons: t.weapons ?? [],
							specials: t.specials ?? [],
						})
					);
				}
			}
			return out;
		};
		const left = expand(armyA, 'A');
		const right = expand(armyB, 'B');
		// simple deployment: A left (cols 0..1), B right (cols-1..cols-2)
		const placeSide = (units, side) => {
			const cols = side === 'left' ? [0, 1] : [board.cols - 1, board.cols - 2];
			let idx = 0;
			for (const u of units) {
				const col = cols[idx % cols.length];
				const row =
					1 + (Math.floor(idx / cols.length) % Math.max(1, board.rows - 2));
				u.x = col;
				u.y = row;
				idx++;
			}
		};
		placeSide(left, 'left');
		placeSide(right, 'right');
		const units = [...left, ...right];
		return new GameState(
			board,
			units,
			'A',
			1,
			null,
			[],
			{ A: armyA, B: armyB },
			{ A: left.length, B: right.length }
		);
	}

	clone(patch = {}) {
		return new GameState(
			patch.board ?? this.board,
			patch.units ?? this.units.map((u) => u.clone()),
			patch.activeFaction ?? this.activeFaction,
			patch.turn ?? this.turn,
			patch.selectedId ?? this.selectedId,
			patch.events ?? this.events,
			patch.armies ?? this.armies,
			patch.startCount ?? this.startCount
		);
	}
	clearEvents() {
		return this.clone({ events: [] });
	}
	get selected() {
		return this.units.find((u) => u.id === this.selectedId) ?? null;
	}
	get occupied() {
		const m = new Map();
		this.units.forEach((u) => m.set(this.board.key(u.x, u.y), u));
		return m;
	}
	getWinner() {
		const a = this.units.some((u) => u.faction === 'A');
		const b = this.units.some((u) => u.faction === 'B');
		if (a && b) return null;
		return a ? 'A' : b ? 'B' : null;
	}
	select(id) {
		const u = this.units.find((x) => x.id === id);
		if (!u) return this.clone({ selectedId: null });
		if (u.faction !== this.activeFaction || u.exhausted) return this;
		return this.clone({ selectedId: id });
	}
	spawnUnit(faction) {
		const x = faction === 'A' ? 0 : this.board.cols - 1;
		const candidates = [];
		for (let y = 0; y < this.board.rows; y++) {
			if (!this.occupied.has(this.board.key(x, y))) candidates.push([x, y]);
		}
		if (candidates.length === 0) return this;
		const [sx, sy] = candidates[Math.floor(Math.random() * candidates.length)];
		// take first template from the chosen army for this faction
		const tpl = this.armies?.[faction]?.units?.[0];
		const units = [...this.units];
		if (tpl) {
			units.push(
				new Unit({
					id: nextId(),
					faction,
					x: sx,
					y: sy,
					hp: tpl.hp,
					maxHp: tpl.hp,
					move: tpl.move,
					type: tpl.type,
					image: tpl.image,
					weapons: tpl.weapons ?? [],
				})
			);
		}
		return this.clone({ units });
	}
	moveSelectedTo(x, y) {
		if (!this.selected) return this;
		if (this.selected.shaken) return this; // Shaken must stay idle to recover :contentReference[oaicite:21]{index=21}
		const key = this.board.key(x, y);
		const movables = this.board.movableTiles(this.selected, this.occupied);
		if (!movables.has(key)) return this;
		// Dangerous terrain: on entering/activating → roll; on 1 take a wound (we model as a wound effect test) :contentReference[oaicite:22]{index=22}
		let units = this.units.map((u) =>
			u.id === this.selected.id ? u.moveTo(x, y) : u
		);
		if (this.board.isDangerous(x, y)) {
			const r = Math.floor(Math.random() * 6) + 1;
			if (r === 1) {
				units = units.map((u) => {
					if (u.id !== this.selected.id) return u;
					const withHp = u.clone({ hp: Math.max(0, u.hp - 1) });
					return Rules.applyWoundEffects(withHp, 1);
				});
				units = units.filter((u) => u.hp > 0); // remove if HP dropped to 0
			}
		}
		return this.clone({ units, selectedId: null });
	}
	attackSelected(targetId) {
		const attacker = this.selected;
		const target = this.units.find((u) => u.id === targetId);
		if (!Rules.canAttack(this.board, attacker, target)) return this;
		const dist = this.board.chebyshev(attacker, target);
		const weapon = Rules.pickWeapon(attacker, dist);
		if (!weapon || weapon.range < dist) return this;
		const isMelee = weapon.range <= 1;
		const res = isMelee
			? Rules.resolveMelee(this.board, attacker, target, weapon, {
					charged: false,
					defenderStrikesBack: false,
			  })
			: Rules.resolveRanged(this.board, attacker, target, weapon);
		let units = this.units;
		if (res.wounds > 0) {
			// 1) subtract HP
			const newHp = Math.max(0, target.hp - res.wounds);
			const withHp = target.clone({ hp: newHp });
			// 2) apply wound effects (shaken/markers/KO behavior)
			const after = Rules.applyWoundEffects(
				withHp,
				res.wounds,
				res.fearBonus || 0
			);
			// 3) remove if HP is 0
			if (after.hp <= 0) {
				units = units.filter((u) => u.id !== target.id);
			} else {
				units = units.map((u) => (u.id === target.id ? after : u));
			}
		}

		// attacker becomes exhausted; melee fatigue handled on charge/strike back at round scope
		units = units.map((u) =>
			u.id === attacker.id ? u.clone({ exhausted: true }) : u
		);
		const ev = {
			kind: 'attack',
			from: { x: attacker.x, y: attacker.y },
			to: { x: target.x, y: target.y },
			melee: isMelee,
			hit: res.wounds > 0,
			weapon: {
				name: weapon.name,
				range: weapon.range,
				dmg: weapon.dmg,
				hits: weapon.hits,
			},
			debug: {
				hitRolls: res.hitRolls,
				saveRolls: res.saveRolls,
				...res.debug,
				wounds: res.wounds,
			},
		};
		return this.clone({
			units,
			selectedId: null,
			events: [...this.events, ev],
		});
	}
	onTileClick(x, y) {
		const clicked = this.occupied.get(this.board.key(x, y));
		if (
			clicked &&
			clicked.faction === this.activeFaction &&
			!clicked.exhausted
		) {
			return this.select(clicked.id);
		}
		if (this.selected) {
			if (clicked && clicked.faction !== this.activeFaction) {
				return this.attackSelected(clicked.id);
			}
			return this.moveSelectedTo(x, y);
		}
		return this.clone({ selectedId: null });
	}
	endTurn() {
		// flip side; when B ends, run end of round (morale, clear fatigue)
		const nextFaction = this.activeFaction === 'A' ? 'B' : 'A';
		const isEndOfRound = this.activeFaction === 'B'; // A->B->(end round)
		let units = this.units.map((u) => u.clone({ exhausted: false }));
		let turn = this.turn;
		if (isEndOfRound) {
			// army morale if down to half or less of starting units :contentReference[oaicite:23]{index=23}
			const aliveA = units.filter((u) => u.faction === 'A').length;
			const aliveB = units.filter((u) => u.faction === 'B').length;
			const tests = [];
			if (Rules.armyHalfOrLess(this.startCount.A, aliveA)) tests.push('A');
			if (Rules.armyHalfOrLess(this.startCount.B, aliveB)) tests.push('B');
			for (const fac of tests) {
				units = units
					.map((u) => {
						if (u.faction !== fac) return u;
						// auto-fail if Shaken (per PDF: always fails morale); else quality test
						const failed = u.shaken ? true : !Rules.test(u.quality).success;
						if (!failed) return u;
						// If already Shaken → rout (removed), else becomes Shaken
						return u.shaken ? null : u.clone({ shaken: true, fatigued: true });
					})
					.filter(Boolean);
			}
			// clear fatigue at round end
			units = units.map((u) => u.clone({ fatigued: false }));
			turn = this.turn + 1;
		}
		return this.clone({
			units,
			activeFaction: nextFaction,
			turn,
			selectedId: null,
		});
	}
}
