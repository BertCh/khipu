import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { corpusFor } from "#/lib/engine/corpus";
import { loadCorpus } from "#/lib/engine/load";
import { drawNull } from "#/lib/engine/nulls";
import { mulberry32, seedFor } from "#/lib/engine/rng";
import { binomUpper } from "#/lib/engine/stats";
import { exactDots, formatP, splitPair } from "#/lib/next/pairdata";
import type { LineupTrial, Spec } from "#/lib/next/types";
import { paintDots, prepCanvas, usePalette } from "./PairDotplot";
import "#/styles/next/pair.css";

const PANELS = 20;
const THUMB = 150;

/** trials made on this page since it loaded, per pair: this session's tally */
const session = new Map<string, { k: number; n: number }>();

interface Panels {
	a: Float64Array | number[];
	bs: (Float64Array | number[])[];
	real: number;
}

function Thumb({
	a,
	b,
	pal,
}: {
	a: ArrayLike<number>;
	b: ArrayLike<number>;
	pal: ReturnType<typeof usePalette>;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const ctx = prepCanvas(ref.current, THUMB, THUMB, false);
		if (!ctx) return;
		ctx.fillStyle = pal["--surface"];
		ctx.fillRect(0, 0, THUMB, THUMB);
		const f = {
			left: 3,
			top: 3,
			w: THUMB - 6,
			h: THUMB - 6,
			view: { x0: 0, x1: a.length, y0: 0, y1: b.length },
		};
		const n = Math.max(a.length, b.length);
		paintDots(ctx, f, { a, b, exact: exactDots(a, b) }, pal, {
			dotScale: n > 200 ? 0.7 : n > 80 ? 0.85 : 1,
			threads: false,
		});
	}, [a, b, pal]);
	return <canvas ref={ref} className="lu-canvas" />;
}

/**
 * A lineup (Buja et al. 2009): the real pair's dotplot hidden among 19 in
 * which the second khipu's values were shuffled. If the real one cannot be
 * told apart, the picture was not evidence.
 */
export default function Lineup(p: {
	pair: string;
	spec: Spec;
	seed: number;
	onTrial: (t: LineupTrial) => void;
}) {
	const [a, b] = splitPair(p.pair);
	const [bump, setBump] = useState(0);
	const seed = p.seed + bump;
	const [panels, setPanels] = useState<Panels | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [focus, setFocus] = useState(0);
	const [picked, setPicked] = useState<number | null>(null);
	const [tally, setTally] = useState(
		() => session.get(p.pair) ?? { k: 0, n: 0 },
	);
	const grid = useRef<HTMLDivElement>(null);
	const root = useRef<HTMLDivElement>(null);
	const pal = usePalette(root);
	const valueSource = p.spec.valueSource === "knots" ? "knots" : "kfg";

	useEffect(() => {
		setTally(session.get(p.pair) ?? { k: 0, n: 0 });
		setBump(0);
	}, [p.pair]);

	useEffect(() => {
		let live = true;
		setPanels(null);
		setPicked(null);
		loadCorpus()
			.then((c0) => {
				const c = corpusFor(c0, valueSource);
				const la = c.byId.get(a);
				const lb = c.byId.get(b);
				if (!la || !lb) throw new Error(`${a} or ${b} is not in the corpus`);
				const real = (seedFor(p.pair, seed) >>> 0) % PANELS;
				const bs: (Float64Array | number[])[] = [];
				for (let i = 0; i < PANELS; i++)
					bs.push(
						i === real
							? lb.seq
							: drawNull(lb, "sequence", mulberry32(seedFor(p.pair, seed, i)))
									.seq,
					);
				if (live) setPanels({ a: la.seq, bs, real });
			})
			.catch((e: unknown) => {
				if (live) setError(String(e));
			});
		return () => {
			live = false;
		};
	}, [a, b, p.pair, seed, valueSource]);

	const pick = (i: number) => {
		if (!panels || picked !== null) return;
		setPicked(i);
		const correct = i === panels.real;
		const cur = session.get(p.pair) ?? { k: 0, n: 0 };
		const next = { k: cur.k + (correct ? 1 : 0), n: cur.n + 1 };
		session.set(p.pair, next);
		setTally(next);
		p.onTrial({
			hypothesisId: `pair:${p.pair}`,
			pair: p.pair,
			seed,
			picked: i,
			real: panels.real,
			correct,
			at: new Date().toISOString(),
		});
	};

	const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const cols =
			grid.current && getComputedStyle(grid.current).gridTemplateColumns
				? getComputedStyle(grid.current).gridTemplateColumns.split(" ").length
				: 5;
		const move: Record<string, number> = {
			ArrowRight: 1,
			ArrowLeft: -1,
			ArrowDown: cols,
			ArrowUp: -cols,
		};
		if (e.key in move) {
			e.preventDefault();
			const next = Math.max(0, Math.min(PANELS - 1, focus + move[e.key]));
			setFocus(next);
			grid.current
				?.querySelectorAll<HTMLButtonElement>("button")
				[next]?.focus();
		}
	};

	const pValue = tally.n ? binomUpper(tally.k, tally.n, 1 / PANELS) : null;
	const cells = useMemo(() => Array.from({ length: PANELS }, (_, i) => i), []);

	return (
		<div className="lu" ref={root}>
			<p className="lu-note">
				One of these twenty dotplots is the real pair; in the other nineteen the
				second khipu's values were shuffled. Pick the one you think is real. One
				viewer who has read the story is not blind; lineups are recorded, never
				decisive.
			</p>
			{error ? (
				<p className="pe-note">Could not build the lineup: {error}</p>
			) : !panels ? (
				<p className="cell-muted">Shuffling…</p>
			) : (
				// biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the panel buttons
				<div className="lu-grid" ref={grid} onKeyDown={onKey}>
					{cells.map((i) => {
						const state =
							picked === null
								? ""
								: i === panels.real
									? " lu-real"
									: i === picked
										? " lu-wrong"
										: " lu-dim";
						return (
							<button
								key={`${seed}-${i}`}
								type="button"
								className={`lu-cell${state}`}
								tabIndex={i === focus ? 0 : -1}
								aria-label={`Panel ${i + 1}${
									picked !== null && i === panels.real ? ", the real pair" : ""
								}${picked === i ? ", your pick" : ""}`}
								aria-pressed={picked === i}
								onClick={() => {
									setFocus(i);
									pick(i);
								}}
							>
								<Thumb a={panels.a} b={panels.bs[i]} pal={pal} />
								<span className="lu-num">{i + 1}</span>
							</button>
						);
					})}
				</div>
			)}
			<div className="lu-foot">
				<p aria-live="polite">
					{picked !== null && panels
						? picked === panels.real
							? `Panel ${picked + 1} is the real pair. `
							: `You picked panel ${picked + 1}; the real pair is panel ${panels.real + 1}. `
						: ""}
					{tally.n > 0
						? `${tally.k} of ${tally.n} correct this session (binomial p ${formatP(pValue)} against a 1-in-20 guess).`
						: "No picks yet this session."}
				</p>
				<button
					type="button"
					className="btn"
					onClick={() => {
						setBump((x) => x + 1);
						setFocus(0);
					}}
				>
					New lineup
				</button>
			</div>
		</div>
	);
}
