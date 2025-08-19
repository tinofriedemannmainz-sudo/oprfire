import React, { useMemo, useState } from 'react';
import CanvasLayer from './ui/CanvasLayer.jsx';
import Toolbar from './ui/Toolbar.jsx';
import Sidebar from './ui/Sidebar.jsx';
import { Board } from './core/board/Board.js';
import { GameState } from './core/state/GameState.js';
import ArmyPicker from './ui/ArmyPicker.jsx';

const COLS = 18;
const ROWS = 12;
const TILE = 72;

export default function App() {
	const [board] = useState(() => new Board(COLS, ROWS, TILE));
	const [game, setGame] = useState(null);
	const [pendingEvents, setPendingEvents] = useState([]); // animations buffer

	const handleStartWithArmies = ({ armyA, armyB }) => {
		// random terrain each new game
		board.randomizeTerrain({
			cover: 0.12,
			difficult: 0.08,
			dangerous: 0.05,
			blocker: 0.06,
			keepEdges: 3,
		});
		setGame(GameState.initialFromArmies(board, armyA, armyB));
	};
	const [scale, setScale] = useState(0.8);
	const [gridVisible, setGridVisible] = useState(true);

	const winner = game?.getWinner ? game.getWinner() : null;

	// Aktionen als reine Übergaben – GameState liefert neue Instanzen zurück
	const actions = useMemo(
		() => ({
			select: (id) => setGame((g) => g.select(id)),
			clickTile: (x, y) => setGame((g) => g.onTileClick(x, y)),
			endTurn: () => setGame((g) => g.endTurn()),
			reset: () =>
				setGame((g) => {
					if (!g?.armies) return g;
					// also randomize on reset
					board.randomizeTerrain({
						cover: 0.12,
						difficult: 0.08,
						dangerous: 0.05,
						blocker: 0.06,
						keepEdges: 2,
					});
					return GameState.initialFromArmies(board, g.armies.A, g.armies.B);
				}),
			spawn: (f) => setGame((g) => g.spawnUnit(f)),
		}),
		[board]
	);

	React.useEffect(() => {
		if (!game) return; // guard until a game exists
		const evts = Array.isArray(game.events) ? game.events : [];
		if (evts.length === 0) return;
		setPendingEvents((prev) => [...prev, ...evts]);
		setGame((g) => g.clearEvents());
	}, [game]);

	return (
		<div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-4">
			{!game ? (
				<ArmyPicker onConfirm={handleStartWithArmies} />
			) : (
				<div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
					<div className="space-y-3">
						<Toolbar
							game={game}
							onEndTurn={actions.endTurn}
							onReset={actions.reset}
							onSpawnA={() => actions.spawn('A')}
							onSpawnB={() => actions.spawn('B')}
							scale={scale}
							setScale={(s) => setScale(s)}
							gridVisible={gridVisible}
							setGridVisible={setGridVisible}
						/>
						<div className="w-full rounded-2xl overflow-auto bg-neutral-900 shadow-lg ring-1 ring-neutral-800">
							<CanvasLayer
								board={board}
								game={game}
								scale={scale}
								gridVisible={gridVisible}
								onTileClick={actions.clickTile}
								events={pendingEvents}
								onEventsConsumed={() => setPendingEvents([])}
							/>
						</div>
						{winner && (
							<div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-center">
								<div className="text-xl font-semibold mb-2">
									{winner === 'A' ? 'Blau' : 'Rot'} gewinnt!
								</div>
								<div className="flex gap-2 justify-center">
									<button
										onClick={actions.reset}
										className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
									>
										Neu starten
									</button>
								</div>
							</div>
						)}
					</div>
					<Sidebar game={game} />
				</div>
			)}
		</div>
	);
}
