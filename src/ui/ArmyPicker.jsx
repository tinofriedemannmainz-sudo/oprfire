import React, { useState } from 'react';
import { ARMIES } from '../data/armies/index.js';

export default function ArmyPicker({ onConfirm }) {
	const [aId, setAId] = useState(ARMIES[0]?.id ?? '');
	const [bId, setBId] = useState(ARMIES[1]?.id ?? ARMIES[0]?.id ?? '');

	const getArmy = (id) => ARMIES.find((x) => x.id === id);

	const start = () => {
		const armyA = getArmy(aId);
		const armyB = getArmy(bId);
		if (armyA && armyB) onConfirm({ armyA, armyB });
	};

	return (
		<div className="min-h-[60vh] flex items-center justify-center">
			<div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
				<h2 className="text-xl font-semibold">Armeen wählen</h2>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div className="space-y-2">
						<label className="text-sm opacity-80">Spieler 1 (A)</label>
						<select
							className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2"
							value={aId}
							onChange={(e) => setAId(e.target.value)}
						>
							{ARMIES.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<label className="text-sm opacity-80">Spieler 2 (B)</label>
						<select
							className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2"
							value={bId}
							onChange={(e) => setBId(e.target.value)}
						>
							{ARMIES.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="flex justify-end">
					<button
						onClick={start}
						className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20"
					>
						Spiel starten
					</button>
				</div>
			</div>
		</div>
	);
}
