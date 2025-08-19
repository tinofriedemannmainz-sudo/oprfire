// SpecialRules.js — parse and evaluate OPR special rules (subset implemented)
export function parseSpecials(list = []) {
	// supports ["Fast", "Fear(1)"] or [{name:"AP", X:2}]
	return (list || [])
		.map((s) => {
			if (!s) return null;
			if (typeof s === 'string') {
				const m = s.match(/^(\w+)(?:\(([-+]?\d+)\))?$/i);
				if (!m) return { name: s, X: null };
				return { name: m[1], X: m[2] != null ? Number(m[2]) : null };
			}
			return {
				name: String(s.name || s.rule || s.type),
				X: s.X ?? s.value ?? null,
			};
		})
		.filter(Boolean);
}

export const SR = {
	has(unitOrWeapon, name) {
		const arr = unitOrWeapon?.specials || [];
		return arr.some(
			(r) => r.name?.toLowerCase() === String(name).toLowerCase()
		);
	},
	getX(unitOrWeapon, name, def = 0) {
		const r = (unitOrWeapon?.specials || []).find(
			(r) => r.name?.toLowerCase() === String(name).toLowerCase()
		);
		return r?.X != null ? Number(r.X) : def;
	},
	// convenience
	ap(wep) {
		return this.getX(wep, 'AP', 0);
	},
	deadly(wep) {
		return this.getX(wep, 'Deadly', 0);
	},
	blast(wep) {
		return this.getX(wep, 'Blast', 0);
	},
	impact(u) {
		return this.getX(u, 'Impact', 0);
	},
	fear(u) {
		return this.getX(u, 'Fear', 0);
	},
	tough(u) {
		return this.getX(u, 'Tough', 0);
	},
};
