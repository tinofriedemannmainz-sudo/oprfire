import React from 'react';

export default function Sidebar({ game }) {
	const u = game.selected;
	return (
		<div className="space-y-3">
			<div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
				<div className="text-lg font-semibold mb-2">Ausgewählte Einheit</div>
				{u ? (
					<div className="text-sm space-y-1">
						<div>
							<span
								className={`px-2 py-1 rounded ${
									u.faction === 'A' ? 'bg-blue-500/80' : 'bg-red-500/80'
								}`}
							>
								{u.faction === 'A' ? 'Blau' : 'Rot'}
							</span>
						</div>
						<div>
							HP: {u.hp}/{u.maxHp}
						</div>
						+{' '}
						<div>
							Qualität: {u.quality}+ &nbsp;|&nbsp; Verteidigung: {u.defense}+
						</div>
						<div>Bewegung: {u.move}</div>+{' '}
						{u.shaken && <div className="text-amber-400">Status: Shaken</div>}+{' '}
						{u.fatigued && (
							<div className="text-amber-400">Status: Fatigued</div>
						)}
						<div className="mt-2 font-medium">Waffen</div>
						{u.weapons?.length ? (
							<ul className="list-disc pl-5 space-y-1">
								{u.weapons.map((w, i) => (
									<li key={i}>
										{w.name ?? `Waffe ${i + 1}`} — Range {w.range}, Dmg {w.dmg},
										Hits {w.hits}+{' '}
										{w.specials?.length ? (
											<div className="opacity-80 text-xs">
												[{w.specials.join(', ')}]
											</div>
										) : null}
									</li>
								))}
							</ul>
						) : (
							<div className="opacity-70">Keine Waffen</div>
						)}
						{u.specials?.length ? (
							<div className="mt-2">
								<div className="font-medium">Sonderregeln</div>
								<div className="opacity-80 text-sm">
									{u.specials.join(', ')}
								</div>
							</div>
						) : null}
						{u.exhausted && <div className="opacity-70">Erschöpft</div>}
					</div>
				) : (
					<div className="text-sm opacity-70">
						Klicke auf eine Einheit, um Details zu sehen.
					</div>
				)}
			</div>

			<div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
				<div className="text-lg font-semibold mb-2">Roadmap</div>
				<ul className="list-disc pl-4 text-sm opacity-90 space-y-1">
					<li>Würfelsystem mit Modifikatoren</li>
					<li>Gelände & Deckung</li>
					<li>
						Profile aus <code>data/profiles.json</code>
					</li>
					<li>Missionsziele und Siegpunkte</li>
					<li>Undo/Redo & LocalStorage Save</li>
				</ul>
			</div>

			<div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 text-xs opacity-70">
				Hinweis: Diese Demo ist nur inspiriert von Skirmish-Regeln. Prüfe
				Marken- & Urheberrechte von "One Page Rules" vor Veröffentlichung.
			</div>
		</div>
	);
}
