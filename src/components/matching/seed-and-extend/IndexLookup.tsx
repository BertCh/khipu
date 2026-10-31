import { useMemo } from "react";
import NumberTape from "#/components/matching/NumberTape";
import TracePlayer from "#/components/matching/TracePlayer";
import { useTrace } from "#/components/matching/useTrace";
import type { ColorTable } from "#/lib/khipu/types";
import { type SeedStep, seedTrace } from "#/lib/matching/seedTrace";
import type { TapeCord } from "#/lib/matching/tape";
import { TileLegend } from "./TileLegend";

const MIN_MAX = 15;
const W = 5;

/**
 * Step 3's figure: A's informative windows fill a hash index keyed by their
 * five values; B's windows are looked up against it, and a hit is a seed.
 * Runs `seedTrace` (src/lib/matching/seedTrace.ts, itself the instrumented
 * form of `pairRun` in src/lib/engine/tests/passages.ts) and keeps only its
 * `window` / `index` / `lookup` steps — `extend` and `run` belong to the next
 * figure.
 */
export function IndexLookup({
	a,
	b,
	aCords,
	bCords,
	colors,
	aLabel,
	bLabel,
}: {
	a: number[];
	b: number[];
	aCords: TapeCord[];
	bCords: TapeCord[];
	colors: ColorTable;
	aLabel: string;
	bLabel: string;
}) {
	const steps = useMemo<Exclude<SeedStep, { kind: "extend" | "run" }>[]>(
		() =>
			seedTrace(a, b, { W, minMax: MIN_MAX }).steps.filter(
				(s): s is Exclude<SeedStep, { kind: "extend" | "run" }> =>
					s.kind !== "extend" && s.kind !== "run",
			),
		[a, b],
	);
	const lookupStarts = useMemo(
		() => new Set(steps.filter((s) => s.kind === "lookup").map((s) => s.start)),
		[steps],
	);
	const firstLookup = steps.findIndex((s) => s.kind === "lookup");
	const trace = useTrace(steps.length, {
		fps: 1.6,
		reducedStep: firstLookup >= 0 ? firstLookup : undefined,
	});
	const cur = steps[trace.step];

	const aMarks = useMemo(() => {
		const seeded = new Set<number>();
		const touched = new Set<number>();
		for (let s = 0; s <= trace.step; s++) {
			const st = steps[s];
			if (st?.kind === "window" && st.side === "a") {
				for (let k = 0; k < st.W; k++) {
					touched.add(st.start + k);
					if (st.informative) seeded.add(st.start + k);
				}
			}
		}
		return { seeded, touched };
	}, [steps, trace.step]);

	const bMarks = useMemo(() => {
		const seeded = new Set<number>();
		const touched = new Set<number>();
		for (let s = 0; s <= trace.step; s++) {
			const st = steps[s];
			if (st?.kind === "window" && st.side === "b") {
				for (let k = 0; k < st.W; k++) {
					touched.add(st.start + k);
					if (st.informative) seeded.add(st.start + k);
				}
			}
		}
		return { seeded, touched };
	}, [steps, trace.step]);

	const indexSoFar = useMemo(() => {
		const m = new Map<string, number[]>();
		for (let s = 0; s <= trace.step; s++) {
			const st = steps[s];
			if (st?.kind === "index") {
				const list = m.get(st.key);
				if (list) list.push(st.start);
				else m.set(st.key, [st.start]);
			}
		}
		return m;
	}, [steps, trace.step]);

	const currentKey =
		cur?.kind === "index" || cur?.kind === "lookup"
			? cur.key
			: cur?.kind === "window" && cur.side === "b" && cur.informative
				? b.slice(cur.start, cur.start + cur.W).join(",")
				: undefined;

	const aState = (i: number) => {
		if (cur?.kind === "lookup" && cur.hits.some((h) => i >= h && i < h + cur.W))
			return "focus" as const;
		if (
			cur?.kind === "window" &&
			cur.side === "a" &&
			i >= cur.start &&
			i < cur.start + cur.W
		)
			return "window" as const;
		if (aMarks.seeded.has(i)) return "seed" as const;
		if (aMarks.touched.has(i)) return "dim" as const;
		return "idle" as const;
	};
	const bState = (i: number) => {
		if (
			(cur?.kind === "window" &&
				cur.side === "b" &&
				i >= cur.start &&
				i < cur.start + cur.W) ||
			(cur?.kind === "lookup" && i >= cur.start && i < cur.start + cur.W)
		)
			return "window" as const;
		if (bMarks.seeded.has(i)) return "seed" as const;
		if (bMarks.touched.has(i)) return "dim" as const;
		return "idle" as const;
	};

	const caption = (() => {
		if (!cur) return null;
		if (cur.kind === "window" && cur.side === "a")
			return cur.informative ? (
				<>
					A: window at cord {cur.start + 1} is informative — about to be
					indexed.
				</>
			) : (
				<>A: window at cord {cur.start + 1} — not informative, skipped.</>
			);
		if (cur.kind === "index")
			return (
				<>
					Indexed: key &ldquo;{cur.key}&rdquo; now points to A cord{" "}
					{cur.start + 1}.
				</>
			);
		if (cur.kind === "window" && cur.side === "b") {
			if (!cur.informative)
				return (
					<>B: window at cord {cur.start + 1} — not informative, skipped.</>
				);
			return lookupStarts.has(cur.start) ? (
				<>
					B: window at cord {cur.start + 1} is informative — checking the index
					next.
				</>
			) : (
				<>
					B: window at cord {cur.start + 1} is informative, but its key isn
					&rsquo;t in A&rsquo;s index — no seed here.
				</>
			);
		}
		if (cur.kind === "lookup")
			return (
				<>
					Hit: B&rsquo;s window at cord {cur.start + 1} matches key &ldquo;
					{cur.key}&rdquo; — a seed with A at cord{" "}
					{cur.hits.map((h) => h + 1).join(", cord ")}.
				</>
			);
		return null;
	})();

	return (
		<div className="sae-index-fig">
			<TracePlayer state={trace} label="Index and lookup" caption={caption}>
				<div className="sae-index-tapes">
					<NumberTape
						cords={aCords}
						colors={colors}
						state={aState}
						label={`${aLabel}, indexing side`}
					/>
					<div className="sae-index-buckets" aria-live="off">
						{indexSoFar.size === 0 ? (
							<span className="sae-index-empty">no entries yet</span>
						) : (
							[...indexSoFar.entries()].map(([key, starts]) => (
								<span
									key={key}
									className={`sae-bucket${key === currentKey ? " is-current" : ""}`}
								>
									<code>{key}</code>
									<span className="sae-bucket-at">
										{starts.map((s) => `cord ${s + 1}`).join(", ")}
									</span>
								</span>
							))
						)}
					</div>
					<NumberTape
						cords={bCords}
						colors={colors}
						state={bState}
						label={`${bLabel}, lookup side`}
					/>
				</div>
			</TracePlayer>
			<TileLegend
				items={[
					{ state: "idle", label: "not yet reached" },
					{ state: "dim", label: "checked, not informative" },
					{ state: "seed", label: "informative" },
					{ state: "window", label: "current window" },
					{ state: "focus", label: "matched in A" },
				]}
			/>
		</div>
	);
}

export default IndexLookup;
