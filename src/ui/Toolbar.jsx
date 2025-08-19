import React from 'react';

export default function Toolbar({
	game,
	onEndTurn,
	onReset,
	onSpawnA,
	onSpawnB,
	scale,
	setScale,
	gridVisible,
	setGridVisible,
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="px-2 py-1 rounded-lg bg-white/10">
				Runde {game.turn}
			</span>
			<span
				className={`px-2 py-1 rounded-lg ${
					game.activeFaction === 'A' ? 'bg-blue-500/80' : 'bg-red-500/80'
				}`}
			>
				Aktiv: {game.activeFaction === 'A' ? 'Blau' : 'Rot'}
			</span>
			<button
				onClick={onSpawnA}
				className="px-3 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500"
			>
				Blau spawnen
			</button>
			<button
				onClick={onSpawnB}
				className="px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-500"
			>
				Rot spawnen
			</button>
			<button
				onClick={onEndTurn}
				className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
			>
				Zug beenden
			</button>
			<button
				onClick={onReset}
				className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/15"
			>
				Reset
			</button>
			<div className="ml-auto flex items-center gap-2">
				<label className="text-sm opacity-80">Zoom</label>
				<input
					type="range"
					min={0.5}
					max={2}
					step={0.05}
					value={scale}
					onChange={(e) => setScale(parseFloat(e.target.value))}
				/>
				<button
					onClick={() => setGridVisible((v) => !v)}
					className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
				>
					Grid: {gridVisible ? 'An' : 'Aus'}
				</button>
			</div>
		</div>
	);
}
