export class Unit {
	constructor({
		id,
		faction,
		x,
		y,
		hp = 3,
		maxHp = 3,
		move = 3,
		quality = 4,
		defense = 4,
		exhausted = false,
		shaken = false,
		fatigued = false,
		woundMarkers = 0,
		type = null,
		image = null,
		weapons = [],
		specials = [],
	}) {
		this.id = id;
		this.faction = faction; // 'A' | 'B'
		this.x = x;
		this.y = y;
		this.hp = hp;
		this.maxHp = maxHp;
		this.move = move;
		this.quality = Number.isFinite(+quality) ? +quality : 4;
		this.defense = Number.isFinite(+defense) ? +defense : 4;
		this.exhausted = exhausted;
		this.shaken = !!shaken;
		this.fatigued = !!fatigued;
		this.woundMarkers = Math.max(0, Math.floor(woundMarkers || 0));
		this.type = type;
		this.image = image;
		this.weapons = (weapons || []).map((w) => {
			const range = Math.max(0, Math.floor(Number(w?.range ?? 1)));
			const dmg = Math.max(0, Math.floor(Number(w?.dmg ?? 1)));
			const hits = Math.max(0, Math.min(50, Math.floor(Number(w?.hits ?? 1))));
			const specials = (w?.specials || []).map((s) =>
				typeof s === 'string'
					? s
					: s.name
					? `${s.name}(${s.X ?? ''})`
					: String(s)
			);
			return { name: w?.name ?? 'Weapon', range, dmg, hits, specials };
		});
		this.specials = specials;
	}
	clone(patch = {}) {
		return new Unit({ ...this, ...patch });
	}
	get pos() {
		return { x: this.x, y: this.y };
	}
	moveTo(x, y) {
		return this.clone({ x, y, exhausted: true });
	}
	takeDamage(n) {
		return this.clone({ hp: this.hp - n });
	}
	bestWeaponForDistance(d) {
		if (!this.weapons?.length) return null;
		const reachers = this.weapons.filter((w) => w.range >= d);
		if (reachers.length)
			return reachers.reduce((a, b) => (a.range <= b.range ? a : b));
		return this.weapons.reduce((a, b) => (a.range >= b.range ? a : b));
	}
}
