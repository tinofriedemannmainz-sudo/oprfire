import React, { useEffect, useRef, useState } from 'react';

// CanvasLayer.jsx — Grid, terrain, units, HP UI, attack animations, and dice roll popups.

export default function CanvasLayer({
	board,
	game,
	scale,
	gridVisible,
	onTileClick,
	events = [],
	onEventsConsumed,
}) {
	const canvasRef = useRef(null);

	// --- Sprite cache (NO hooks inside loops) ---
	// url -> { img: HTMLImageElement, status: 'loading' | 'loaded' | 'error' }
	const spriteCacheRef = useRef(new Map());
	const [imgVersion, setImgVersion] = useState(0); // bump to redraw when images load/error

	const getSprite = (url) => {
		if (!url) return null;
		let rec = spriteCacheRef.current.get(url);
		if (!rec) {
			const img = new Image();
			rec = { img, status: 'loading' };
			spriteCacheRef.current.set(url, rec);
			img.onload = () => {
				rec.status = 'loaded';
				setImgVersion((v) => v + 1);
			};
			img.onerror = () => {
				rec.status = 'error';
				setImgVersion((v) => v + 1);
			};
			img.src = url; // use whatever path you provided in your config
		}
		return rec;
	};

	// --- Animation/effects state ---
	const rafRef = useRef(0);
	const effectsRef = useRef([]); // { type, t0, dur, from, to, delay?, hit?, lines? }
	const [animTick, setAnimTick] = useState(0);

	const [size, setSize] = useState(() => ({
		width: board.cols * board.tile * scale,
		height: board.rows * board.tile * scale,
	}));

	useEffect(() => {
		setSize({
			width: board.cols * board.tile * scale,
			height: board.rows * board.tile * scale,
		});
	}, [board, scale]);

	// RAF loop only while effects exist
	const ensureRAF = () => {
		if (rafRef.current) return;
		const loop = () => {
			setAnimTick((t) => t + 1);
			rafRef.current = requestAnimationFrame(loop);
			if (!effectsRef.current.length) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = 0;
			}
		};
		rafRef.current = requestAnimationFrame(loop);
	};

	useEffect(() => {
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	// Consume incoming game events -> spawn visual effects (incl. dice popup)
	useEffect(() => {
		if (!events || events.length === 0) return;
		const now = performance.now();
		for (const ev of events) {
			if (ev.kind !== 'attack') continue;
			if (ev.melee) {
				// Melee: quick arc slash + impact (spark or miss)
				effectsRef.current.push({
					type: 'slash',
					t0: now,
					dur: 250,
					to: ev.to,
				});
				effectsRef.current.push({
					type: ev.hit ? 'spark' : 'miss',
					t0: now,
					delay: 180,
					dur: 280,
					to: ev.to,
				});
			} else {
				// Ranged: projectile travels, then impact (spark or miss)
				const travel = 300;
				effectsRef.current.push({
					type: 'projectile',
					t0: now,
					dur: travel,
					from: ev.from,
					to: ev.to,
				});
				effectsRef.current.push({
					type: ev.hit ? 'spark' : 'miss',
					t0: now,
					delay: travel - 20,
					dur: 320,
					to: ev.to,
				});
			}

			// Dice log popup
			const dbg = ev.debug || {};
			const toHitLine = Array.isArray(dbg.hitRolls)
				? `HIT: [${dbg.hitRolls.join(', ')}]`
				: null;
			const saveLine = Array.isArray(dbg.saveRolls)
				? `SAVE: [${dbg.saveRolls.join(', ')}]`
				: null;
			const woundsLine =
				typeof dbg.wounds === 'number' ? `WOUNDS: ${dbg.wounds}` : null;
			const lines = [toHitLine, saveLine, woundsLine].filter(Boolean);
			if (lines.length) {
				effectsRef.current.push({
					type: 'rolls',
					t0: now,
					dur: 1800,
					to: ev.to,
					lines,
				});
			}
		}
		onEventsConsumed && onEventsConsumed();
		ensureRAF();
	}, [events, onEventsConsumed]);

	// Main draw
	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas.getContext('2d');

		// HiDPI
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.floor(size.width * dpr);
		canvas.height = Math.floor(size.height * dpr);
		canvas.style.width = `${size.width}px`;
		canvas.style.height = `${size.height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const TILE = board.tile * scale;

		// Function to draw a hexagon
		const drawHexagon = (ctx, x, y, size) => {
			const sideLength = size / 2;
			const width = Math.sqrt(3) * sideLength;
			const height = 2 * sideLength;
			ctx.beginPath();
			for (let i = 0; i < 6; i++) {
				const angle = (Math.PI / 3) * i;
				const newX = x + width * Math.cos(angle);
				const newY = y + height * Math.sin(angle);
				if (i === 0) {
					ctx.moveTo(newX, newY);
				} else {
					ctx.lineTo(newX, newY);
				}
			}
			ctx.closePath();
		};

		// Background
		ctx.fillStyle = '#0b0b0b';
		ctx.fillRect(0, 0, size.width, size.height);

		// --- Terrain hexagons (subtle tints) ---
		const terrainFill = {
			cover: 'rgba(34,197,94,0.15)', // green
			difficult: 'rgba(168,85,33,0.15)', // brown
			dangerous: 'rgba(239,68,68,0.15)', // red
			blocker: 'rgba(148,163,184,0.25)', // slate
		};
		if (typeof board.getTerrain === 'function') {
			for (let y = 0; y < board.rows; y++) {
				for (let x = 0; x < board.cols; x++) {
					const kind = board.getTerrain(x, y);
					if (kind && kind !== 'plain') {
						ctx.fillStyle = terrainFill[kind] || 'rgba(255,255,255,0.08)';
						const hexX = x * TILE * 0.75;
						const hexY = y * TILE * Math.sqrt(3) / 2;
						drawHexagon(ctx, hexX, hexY, TILE);
						ctx.fill();
						// hatch for hard-ish terrain
						if (
							kind === 'difficult' ||
							kind === 'dangerous' ||
							kind === 'blocker'
						) {
							ctx.strokeStyle = 'rgba(255,255,255,0.06)';
							ctx.lineWidth = 1;
							ctx.moveTo(hexX + TILE * 0.2, hexY + TILE * 0.3);
							ctx.lineTo(hexX + TILE * 0.5, hexY + TILE * 0.1);
							ctx.stroke();
						}
					}
				}
			}
		}

		// Grid
		if (gridVisible) {
			ctx.strokeStyle = '#1f2937';
			ctx.lineWidth = 1;
			for (let y = 0; y < board.rows; y++) {
				for (let x = 0; x < board.cols; x++) {
					const hexX = x * TILE * 0.75;
					const hexY = y * TILE * Math.sqrt(3) / 2;
					drawHexagon(ctx, hexX, hexY, TILE);
					ctx.stroke();
				}
			}
		}

		// Movable hexagons for selected unit
		if (game.selected) {
			const movable = board.movableTiles(game.selected, game.occupied);
			ctx.fillStyle = 'rgba(96,165,250,0.15)';
			for (const key of movable) {
				const [sx, sy] = key.split(',').map(Number);
				const hexX = sx * TILE * 0.75;
				const hexY = sy * TILE * Math.sqrt(3) / 2;
				drawHexagon(ctx, hexX, hexY, TILE);
				ctx.fill();
			}
		}

		// Units
		for (const u of game.units) {
			const cx = (u.x + 0.5) * TILE * 0.75;
			const cy = (u.y + 0.5) * TILE * Math.sqrt(3) / 2;

			// Image if loaded; otherwise fallback disc
			let drewSprite = false;
			if (u.image) {
				const rec = getSprite(u.image);
				if (rec && rec.status === 'loaded' && rec.img.naturalWidth > 0) {
					ctx.drawImage(
						rec.img,
						cx - TILE / 2 + 2,
						cy - TILE / 2 + 2,
						TILE - 4,
						TILE - 4
					);
					drewSprite = true;
				}
			}
			if (!drewSprite) {
				ctx.beginPath();
				ctx.arc(cx, cy, TILE * 0.35, 0, Math.PI * 2);
				ctx.fillStyle = u.faction === 'A' ? '#60a5fa' : '#f87171';
				ctx.fill();
				ctx.lineWidth = game.selected && game.selected.id === u.id ? 6 : 3;
				ctx.strokeStyle =
					game.selected && game.selected.id === u.id
						? '#f59e0b'
						: u.faction === 'A'
						? '#1d4ed8'
						: '#b91c1c';
				ctx.stroke();
			}

			// Exhausted overlay
			if (u.exhausted) {
				ctx.fillStyle = 'rgba(0,0,0,0.35)';
				ctx.fillRect(cx - TILE * 0.4, cy - TILE * 0.4, TILE * 0.8, TILE * 0.8);
			}

			// HP bar
			const barW = TILE * 0.8;
			const barH = 8;
			ctx.fillStyle = 'rgba(0,0,0,0.45)';
			ctx.fillRect(cx - barW / 2, cy + TILE * 0.4, barW, barH);
			const ratio = Math.max(0, u.hp / u.maxHp);
			ctx.fillStyle = '#10b981';
			ctx.fillRect(cx - barW / 2, cy + TILE * 0.4, barW * ratio, barH);

			// HP circle badge (top-right)
			const r = Math.max(10, Math.floor(TILE * 0.16));
			const bx = cx + r + 4;
			const by = cy - r - 4;
			let fill = '#22c55e';
			if (ratio <= 0.33) fill = '#ef4444';
			else if (ratio <= 0.66) fill = '#eab308';
			ctx.beginPath();
			ctx.arc(bx, by, r, 0, Math.PI * 2);
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = 'rgba(0,0,0,0.65)';
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${Math.max(
				10,
				Math.floor(r * 1.1)
			)}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(Math.max(0, u.hp)), bx, by);
		}

		// Selected range ring (uses first weapon)
		if (game.selected) {
			const u = game.selected;
			const w = u.weapons?.[0];
			if (w) {
				const cx = (u.x + 0.5) * TILE * 0.75;
				const cy = (u.y + 0.5) * TILE * Math.sqrt(3) / 2;
				ctx.strokeStyle = '#f59e0b';
				ctx.lineWidth = 2;
				const rr = (w.range + 0.5) * TILE;
				ctx.beginPath();
				ctx.arc(cx, cy, rr, 0, Math.PI * 2);
				ctx.stroke();
			}
		}

		// --- EFFECTS / ANIMATIONS ---
		const now = performance.now();
		const center = (p) => ({ x: (p.x + 0.5) * TILE * 0.75, y: (p.y + 0.5) * TILE * Math.sqrt(3) / 2 });
		const active = [];
		for (const fx of effectsRef.current) {
			const delay = fx.delay ?? 0;
			const t = (now - fx.t0 - delay) / fx.dur;
			if (t < 0) {
				active.push(fx);
				continue; // not started yet
			}
			if (t >= 1) {
				continue; // finished
			}
			active.push(fx);
			const ease = t * (2 - t); // ease-out

			if (fx.type === 'slash') {
				const c = center(fx.to);
				const ang0 = Math.PI * 0.15;
				const sweep = Math.PI * 1.2 * ease;
				ctx.save();
				ctx.translate(c.x, c.y);
				ctx.rotate(Math.PI * 0.25);
				ctx.strokeStyle = '#f59e0b';
				ctx.lineWidth = 6;
				ctx.beginPath();
				ctx.arc(0, 0, TILE * 0.45, -ang0, -ang0 + sweep);
				ctx.stroke();
				ctx.restore();
			} else if (fx.type === 'projectile') {
				const a = center(fx.from),
					b = center(fx.to);
				const x = a.x + (b.x - a.x) * ease;
				const y = a.y + (b.y - a.y) * ease;
				ctx.beginPath();
				ctx.arc(x, y, Math.max(3, TILE * 0.06), 0, Math.PI * 2);
				ctx.fillStyle = '#fbbf24';
				ctx.shadowColor = '#f59e0b';
				ctx.shadowBlur = 12;
				ctx.fill();
				ctx.shadowBlur = 0;
			} else if (fx.type === 'spark') {
				const c = center(fx.to);
				const rad = TILE * (0.15 + 0.35 * ease);
				ctx.beginPath();
				ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
				ctx.strokeStyle = `rgba(251,191,36,${1 - ease})`;
				ctx.lineWidth = 3;
				ctx.stroke();
			} else if (fx.type === 'miss') {
				const c = center(fx.to);
				const s = TILE * (0.1 + 0.2 * ease);
				ctx.strokeStyle = `rgba(239,68,68,${0.8 - 0.8 * ease})`;
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.moveTo(c.x - s, c.y - s);
				ctx.lineTo(c.x + s, c.y + s);
				ctx.stroke();
				ctx.beginPath();
				ctx.moveTo(c.x + s, c.y - s);
				ctx.lineTo(c.x - s, c.y + s);
				ctx.stroke();
			} else if (fx.type === 'rolls') {
				const c = center(fx.to);
				const alpha = 1 - ease;
				const pad = 6; // device-agnostic padding
				ctx.save();
				ctx.globalAlpha = alpha;
				// Background box
				const text = fx.lines;
				ctx.font = `12px system-ui, sans-serif`;
				const w =
					(text.length
						? Math.max(...text.map((s) => ctx.measureText(s).width))
						: 0) +
					pad * 2;
				const h = text.length * 16 + pad * 2;
				const x = c.x + 10;
				const y = c.y - TILE * 0.7;
				ctx.fillStyle = 'rgba(17,24,39,0.9)'; // dark
				ctx.strokeStyle = 'rgba(255,255,255,0.2)';
				ctx.lineWidth = 1;
				if (ctx.roundRect) {
					ctx.beginPath();
					ctx.roundRect(x, y, w, h, 6);
					ctx.fill();
					ctx.stroke();
				} else {
					ctx.fillRect(x, y, w, h);
					ctx.strokeRect(x, y, w, h);
				}
				// Text
				ctx.fillStyle = '#fff';
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				let ty = y + pad;
				for (const s of text) {
					ctx.fillText(s, x + pad, ty);
					ty += 16;
				}
				ctx.restore();
			}
		}
		effectsRef.current = active;
		if (active.length) ensureRAF();
	}, [board, game, gridVisible, scale, size, animTick, imgVersion]);

	// Click → hexagonal tile coords
	const onClick = (e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const TILE = board.tile * scale;
		const q = (px * 2) / (3 * TILE);
		const r = ((-px / 3) + (Math.sqrt(3) / 3) * py) / (TILE * Math.sqrt(3) / 2);
		const x = Math.round(q);
		const y = Math.round(r);
		onTileClick(x, y);
	};

	return (
		<canvas
			ref={canvasRef}
			onClick={onClick}
			className="block w-full h-auto cursor-crosshair select-none"
		/>
	);
}