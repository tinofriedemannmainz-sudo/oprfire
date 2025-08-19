export class Board {
	constructor(cols, rows, tile = 72) {
		this.cols = cols;
		this.rows = rows;
		this.tile = tile;
		// simple per-tile terrain: 'plain' | 'cover' | 'difficult' | 'dangerous' | 'blocker'
		this.terrain = Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => 'plain')
		);
	}
	key(x, y) {
		return `${x},${y}`;
	}
	inside(x, y) {
		return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
	}
	chebyshev(a, b) {
		return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
	}

	setTerrain(x, y, kind) {
		if (this.inside(x, y)) this.terrain[y][x] = kind;
	}
	getTerrain(x, y) {
		return this.inside(x, y) ? this.terrain[y][x] : 'plain';
	}
	isCover(x, y) {
		return this.getTerrain(x, y) === 'cover';
	}
	isDifficult(x, y) {
		return this.getTerrain(x, y) === 'difficult';
	}
	isDangerous(x, y) {
		return this.getTerrain(x, y) === 'dangerous';
	}
	clearTerrain() {
		for (let y = 0; y < this.rows; y++)
			for (let x = 0; x < this.cols; x++) this.terrain[y][x] = 'plain';
	}
	isBlocker(x, y) {
		return this.getTerrain(x, y) === 'blocker';
	}
	// movement cost (orthogonal moves only in this game)
	moveCost(x, y) {
		const k = this.getTerrain(x, y);
		if (k === 'blocker') return Infinity; // impassable
		if (k === 'difficult') return 2; // slower
		return 1; // plain, cover, dangerous
	}

	// Bresenham line (tiles strictly between a and b, excludes endpoints)
	lineTiles(ax, ay, bx, by) {
		let x0 = ax,
			y0 = ay,
			x1 = bx,
			y1 = by;
		const dx = Math.abs(x1 - x0),
			dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1,
			sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;
		const tiles = [];
		while (!(x0 === x1 && y0 === y1)) {
			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dx) {
				err += dx;
				y0 += sy;
			}
			if (x0 === x1 && y0 === y1) break; // exclude target
			tiles.push([x0, y0]);
		}
		return tiles;
	}
	/**
	 * Randomly scatter terrain. Densities are probabilities per tile.
	 * keepEdges: how many columns on each side to keep clear for deployment.
	 */
	randomizeTerrain({
		cover = 0.12,
		difficult = 0.08,
		dangerous = 0.05,
		blocker = 0.06,
		keepEdges = 2,
	} = {}) {
		this.clearTerrain();
		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				// keep deployment edges clear
				if (x < keepEdges || x >= this.cols - keepEdges) continue;
				const r = Math.random();
				if (r < blocker) this.terrain[y][x] = 'blocker';
				else if (r < blocker + cover) this.terrain[y][x] = 'cover';
				else if (r < blocker + cover + difficult)
					this.terrain[y][x] = 'difficult';
				else if (r < blocker + cover + difficult + dangerous)
					this.terrain[y][x] = 'dangerous';
			}
		}
	}
	// Reachable tiles with terrain costs (Dijkstra, 4-neighbour)
	movableTiles(unit, occupied) {
		const maxCost = unit.move;
		const startKey = this.key(unit.x, unit.y);
		const dist = new Map([[startKey, 0]]);
		const open = [{ x: unit.x, y: unit.y, cost: 0 }];
		const s = new Set();
		const dirs = [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		];
		while (open.length) {
			// pop min cost (small board -> linear is fine)
			let best = 0;
			for (let i = 1; i < open.length; i++)
				if (open[i].cost < open[best].cost) best = i;
			const cur = open.splice(best, 1)[0];
			for (const [dx, dy] of dirs) {
				const nx = cur.x + dx,
					ny = cur.y + dy;
				if (!this.inside(nx, ny)) continue;
				const key = this.key(nx, ny);
				if (occupied.has(key)) continue;
				const step = this.moveCost(nx, ny);
				if (!Number.isFinite(step)) continue; // impassable (blocker)
				const nc = cur.cost + step;
				if (nc > maxCost) continue;
				const old = dist.get(key);
				if (old == null || nc < old) {
					dist.set(key, nc);
					open.push({ x: nx, y: ny, cost: nc });
					if (key !== startKey) s.add(key);
				}
			}
		}
		return s;
	}
}
