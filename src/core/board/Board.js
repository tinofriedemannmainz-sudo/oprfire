export class Board {
	constructor(cols, rows, tile = 72) {
		this.cols = cols;
		this.rows = rows;
		this.tile = tile;
		// simple per-tile terrain: 'plain' | 'cover' | 'difficult' | 'dangerous' | 'blocker'
		this.terrain = Array.from({ length: rows }, () => Array(cols).fill('plain'));
	}

	key(hex) {
		return `${hex.q},${hex.r}`;
	}

	inside(hex) {
		return hex.q >= 0 && hex.r >= 0 && hex.q < this.cols && hex.r < this.rows;
	}

	hexDistance(a, b) {
		return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
	}

	setTerrain(hex, kind) {
		if (this.inside(hex)) this.terrain[hex.r][hex.q] = kind;
	}

	getTerrain(hex) {
		return this.inside(hex) ? this.terrain[hex.r][hex.q] : 'plain';
	}

	isCover(hex) {
		return this.getTerrain(hex) === 'cover';
	}

	isDifficult(hex) {
		return this.getTerrain(hex) === 'difficult';
	}

	isDangerous(hex) {
		return this.getTerrain(hex) === 'dangerous';
	}

	clearTerrain() {
		for (let r = 0; r < this.rows; r++)
			for (let q = 0; q < this.cols; q++) this.terrain[r][q] = 'plain';
	}

	isBlocker(hex) {
		return this.getTerrain(hex) === 'blocker';
	}

	moveCost(hex) {
		const k = this.getTerrain(hex);
		if (k === 'blocker') return Infinity; // impassable
		if (k === 'difficult') return 2; // slower
		return 1; // plain, cover, dangerous
	}

	hexNeighbors(hex) {
		const directions = [
			{ q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
			{ q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 }
		];
		return directions.map(dir => ({ q: hex.q + dir.q, r: hex.r + dir.r }));
	}

	lineTiles(hexStart, hexEnd) {
		let hex = hexStart;
		const results = [];
		const N = this.hexDistance(hexStart, hexEnd);
		for (let i = 0; i <= N; i++) {
			results.push(hex);
			hex = this.hexLerp(hexStart, hexEnd, (i + 1) / (N + 1));
		}
		return results.slice(1, -1);  // exclude start and end tiles, only between.
	}

	hexLerp(a, b, t) {
		const q = a.q + (b.q - a.q) * t;
		const r = a.r + (b.r - a.r) * t;
		return { q: Math.round(q), r: Math.round(r) };
	}

	randomizeTerrain({ cover = 0.12, difficult = 0.08, dangerous = 0.05, blocker = 0.06, keepEdges = 2 } = {}) {
		this.clearTerrain();
		for (let r = 0; r < this.rows; r++) {
			for (let q = 0; q < this.cols; q++) {
				if (q < keepEdges || q >= this.cols - keepEdges || r < keepEdges || r >= this.rows - keepEdges) continue;
				const rand = Math.random();
				if (rand < blocker) this.terrain[r][q] = 'blocker';
				else if (rand < blocker + cover) this.terrain[r][q] = 'cover';
				else if (rand < blocker + cover + difficult) this.terrain[r][q] = 'difficult';
				else if (rand < blocker + cover + difficult + dangerous) this.terrain[r][q] = 'dangerous';
			}
		}
	}

	movableTiles(unit, occupied) {
		const maxCost = unit.move;
		const startKey = this.key({ q: unit.q, r: unit.r });
		const dist = new Map([[startKey, 0]]);
		const open = [{ q: unit.q, r: unit.r, cost: 0 }];
		const s = new Set();
		while (open.length) {
			let best = 0;
			for (let i = 1; i < open.length; i++)
				if (open[i].cost < open[best].cost) best = i;
			const cur = open.splice(best, 1)[0];
			for (const neighbor of this.hexNeighbors(cur)) {
				if (!this.inside(neighbor)) continue;
				const key = this.key(neighbor);
				if (occupied.has(key)) continue;
				const step = this.moveCost(neighbor);
				if (!Number.isFinite(step)) continue;
				const nc = cur.cost + step;
				if (nc > maxCost) continue;
				const old = dist.get(key);
				if (old == null || nc < old) {
					dist.set(key, nc);
					open.push({ q: neighbor.q, r: neighbor.r, cost: nc });
					if (key !== startKey) s.add(key);
				}
			}
		}
		return s;
	}
}
