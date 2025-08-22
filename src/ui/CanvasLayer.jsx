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
		width: board.cols * board.tile * scale * Math.sqrt(3),  // adjusted for horizontal width with exact hexagonal tiling
		height: board.rows * board.tile * scale * 1.5, // adjusted for vertical height with exact hexagonal tiling
	}));

	useEffect(() => {
		setSize({
			width: board.cols * board.tile * scale * Math.sqrt(3),
			height: board.rows * board.tile * scale * 1.5,
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

		// Function to draw a hexagon with proper staggered alignment
		const drawHexagon = (ctx, x, y, size) => {
			const height = size * 2;
			const width = Math.sqrt(3) * size;
			ctx.beginPath();
			ctx.moveTo(x, y - size);
			ctx.lineTo(x + width / 2, y - size / 2);
			ctx.lineTo(x + width / 2, y + size / 2);
			ctx.lineTo(x, y + size);
			ctx.lineTo(x - width / 2, y + size / 2);
			ctx.lineTo(x - width / 2, y - size / 2);
			ctx.closePath();
		};

		// Render hexagonal grid with staggered alignment
		const renderHexGrid = (ctx) => {
			for (let row = 0; row < board.rows; row++) {
				for (let col = 0; col < board.cols; col++) {
					const xOffset = col * TILE * Math.sqrt(3);
					const yOffset = row * TILE * 1.5;
					if (col % 2 !== 0) yOffset += TILE * 0.75;  // Apply stagger for odd rows
					drawHexagon(ctx, xOffset, yOffset, TILE / 2);
					if (gridVisible) ctx.stroke();
				}
			}
		};

		// Background
		ctx.fillStyle = '#0b0b0b';
		ctx.fillRect(0, 0, size.width, size.height);

		// Terrain hexagons (subtle tints)
		const terrainFill = {
			cover: 'rgba(34,197,94,0.15)', // green
			difficult: 'rgba(168,85,33,0.15)', // brown
			dangerous: 'rgba(239,68,68,0.15)', // red
			blocker: 'rgba(148,163,184,0.25)', // slate
		};
		if (typeof board.getTerrain === 'function') {
			for (let row = 0; row < board.rows; row++) {
				for (let col = 0; col < board.cols; col++) {
					const terrainType = board.getTerrain(col, row);
					if (terrainType && terrainType !== 'plain') {
						ctx.fillStyle = terrainFill[terrainType] || 'rgba(255,255,255,0.08)';
						const hexX = col * TILE * Math.sqrt(3);
						const hexY = row * TILE * 1.5;
						if (col % 2 !== 0) hexY += TILE * 0.75; // Apply stagger for odd rows
						drawHexagon(ctx, hexX, hexY, TILE / 2);
						ctx.fill();
					}
				}
			}
		}

		// Render the hexagonal grid
		renderHexGrid(ctx);

		// Movable hexagons for selected unit
		if (game.selected) {
			const movable = board.movableTiles(game.selected, game.occupied);
			ctx.fillStyle = 'rgba(96,165,250,0.15)';
			for (const key of movable) {
				const [sx, sy] = key.split(',').map(Number);
				const hexX = sx * TILE * Math.sqrt(3);
				const hexY = sy * TILE * 1.5;
				if (sx % 2 !== 0) hexY += TILE * 0.75; // Apply stagger for odd columns
				drawHexagon(ctx, hexX, hexY, TILE / 2);
				ctx.fill();
			}
		}

		// Function to draw a unit icon within the hexagon fitting correctly
		const drawUnitIcon = (ctx, image, cx, cy, size) => {
			const iconSize = size * 1.6 / Math.sqrt(3); // Adjust size to fit within hexagon
			const iconX = cx - iconSize / 2;
			const iconY = cy - size / 4; // Adjust position for hexagon
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(cx, cy - size / 2);
			ctx.lineTo(cx + iconSize / Math.sqrt(3), cy - size / 4);
			ctx.lineTo(cx + iconSize / Math.sqrt(3), cy + size / 4);
			ctx.lineTo(cx, cy + size / 2);
			ctx.lineTo(cx - iconSize / Math.sqrt(3), cy + size / 4);
			ctx.lineTo(cx - iconSize / Math.sqrt(3), cy - size / 4);
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(image, iconX, iconY, iconSize, iconSize);
			ctx.restore();
		};

		// Units
		for (const unit of game.units) {
			const cx = unit.x * TILE * Math.sqrt(3) + TILE * Math.sqrt(3) / 2;
			const cy = unit.y * TILE * 1.5 + TILE;
			if (unit.x % 2 !== 0) cy += TILE * 0.75;

			// Use getSprite function to get the unit image
			const sprite = getSprite(unit.iconUrl);
			if (sprite && sprite.status === 'loaded') {
				drawUnitIcon(ctx, sprite.img, cx, cy, TILE / 2);
			}

			// HP bar
			const barW = TILE * 0.8;
			const barH = 8;
			ctx.fillStyle = 'rgba(0,0,0,0.45)';
			ctx.fillRect(cx - barW / 2, cy + TILE * 0.4, barW, barH);
			const ratio = Math.max(0, unit.hp / unit.maxHp);
			ctx.fillStyle = '#10b981';
			ctx.fillRect(cx - barW / 2, cy + TILE * 0.4, barW * ratio, barH);

			// HP circle badge (top-right)
			const radius = Math.max(10, Math.floor(TILE * 0.16));
			const badgeX = cx + radius + 4;
			const badgeY = cy - radius - 4;
			let fillColor = '#22c55e';
			if (ratio <= 0.33) fillColor = '#ef4444';
			else if (ratio <= 0.66) fillColor = '#eab308';
			ctx.beginPath();
			ctx.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
			ctx.fillStyle = fillColor;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = 'rgba(0,0,0,0.65)';
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${Math.max(
				10,
				Math.floor(radius * 1.1)
			)}px system-ui, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(Math.max(0, unit.hp)), badgeX, badgeY);
		}

		// Selected range ring (uses first weapon)
		if (game.selected) {
			const unit = game.selected;
			const weapon = unit.weapons?.[0];
			if (weapon) {
				const cx = unit.x * TILE * Math.sqrt(3) + TILE * Math.sqrt(3) / 2;
				const cy = unit.y * TILE * 1.5 + TILE;
				if (unit.x % 2 !== 0) cy += TILE * 0.75;
				ctx.strokeStyle = '#f59e0b';
				ctx.lineWidth = 2;
				const rangeRadius = (weapon.range + 0.5) * TILE;
				ctx.beginPath();
				ctx.arc(cx, cy, rangeRadius, 0, Math.PI * 2);
				ctx.stroke();
			}
		}

		// --- EFFECTS / ANIMATIONS ---
		const now = performance.now();
		const center = (pos) => ({
			x: pos.x * TILE * Math.sqrt(3) + TILE * Math.sqrt(3) / 2,
			y: pos.y * TILE * 1.5 + TILE,
			...((pos.x % 2 !== 0) && { y: pos.y * TILE * 1.5 + TILE + TILE * 0.75 })
		});
		const activeEffects = [];
		for (const fx of effectsRef.current) {
			const delay = fx.delay ?? 0;
			const t = (now - fx.t0 - delay) / fx.dur;
			if (t < 0) {
				activeEffects.push(fx);
				continue; // not started yet
			}
			if (t >= 1) {
				continue; // finished
			}
			activeEffects.push(fx);
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
				const textLines = fx.lines;
				ctx.font = `12px system-ui, sans-serif`;
				const w =
					(textLines.length
						? Math.max(...textLines.map((s) => ctx.measureText(s).width))
						: 0) +
					pad * 2;
				const h = textLines.length * 16 + pad * 2;
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
				for (const s of textLines) {
					ctx.fillText(s, x + pad, ty);
					ty += 16;
				}
				ctx.restore();
			}
		}
		effectsRef.current = activeEffects;
		if (activeEffects.length) ensureRAF();
	}, [board, game, gridVisible, scale, size, animTick, imgVersion]);

	// Click → hexagonal tile coords
	const onClick = (e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const TILE = board.tile * scale;
		const q = (px * 2) / (3 * TILE);
		const r = ((-px / 3) + (Math.sqrt(3) / 3) * py) / (TILE * 1.5);
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