import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CHAPTER_PATH } from "#/components/matching/ChapterShell";
import NullHistogram from "#/components/matching/NullHistogram";
import type { Khipu } from "#/lib/khipu/types";
import {
	type ChanceData,
	type DemoId,
	lowerP,
	pendantSums,
	pendantValues,
	shuffled,
	upperP,
} from "#/lib/stories/chance";

export interface ShuffleWarningProps {
	data: ChanceData;
	khipus: Record<string, Khipu>;
	ids: readonly DemoId[];
}

const LABEL: Record<DemoId, string> = {
	KH0698: "KH0698 — the most sums of any khipu here",
	KH0081: "KH0081 — the one this chapter has been reading",
};

/**
 * The same search, shuffled: `pendantSums` (and `sumTrace`, Figures 1–2
 * above) run again on cords shuffled by `shuffled` (src/lib/stories/
 * chance.ts's own mulberry32 Fisher–Yates), as many times as the reader
 * likes, next to the `R` shuffles already computed for
 * public/data/stories/chance.json. A count of sums on its own does not say
 * whether a recorder intended them — chapter 5 checks every khipu this way.
 */
export default function ShuffleWarning({
	data,
	khipus,
	ids,
}: ShuffleWarningProps) {
	const [id, setId] = useState<DemoId>(ids[0]);
	const [mine, setMine] = useState<Record<DemoId, number[]>>(() => {
		const init = {} as Record<DemoId, number[]>;
		for (const d of ids) init[d] = [];
		return init;
	});
	const [busy, setBusy] = useState(false);

	const original = useMemo(() => pendantValues(khipus[id]), [khipus, id]);
	const obs = useMemo(() => pendantSums(original).length, [original]);
	const precomputed = data.demo[id].null;
	const nulls = useMemo(
		() => [...precomputed, ...mine[id]],
		[precomputed, mine, id],
	);
	const pUp = upperP(obs, nulls);
	const pDown = lowerP(obs, nulls);
	const direction: "upper" | "lower" = pUp <= pDown ? "upper" : "lower";

	const shuffleAgain = () => {
		setBusy(true);
		const seed =
			Math.floor(Math.random() * 2 ** 31) + mine[id].length * 7919 + 13;
		const count = pendantSums(shuffled(original, seed)).length;
		setMine((m) => ({ ...m, [id]: [...m[id], count] }));
		setBusy(false);
	};

	const above = nulls.filter((x) => x >= obs).length;
	const below = nulls.filter((x) => x <= obs).length;

	return (
		<div className="shuffle-warning">
			<div className="diagram-tools">
				{ids.map((d) => (
					<button
						key={d}
						type="button"
						className="btn"
						aria-pressed={id === d}
						onClick={() => setId(d)}
					>
						{LABEL[d]}
					</button>
				))}
				<span className="spacer" />
				<button
					type="button"
					className="btn btn-primary"
					onClick={shuffleAgain}
					disabled={busy}
				>
					Shuffle the cords again
				</button>
			</div>
			<p className="shuffle-warning-count" aria-live="polite">
				As tied: <strong>{obs}</strong> pendant–pendant sums.{" "}
				{mine[id].length > 0 && (
					<>
						Your shuffles so far:{" "}
						{mine[id].map((c, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: an append-only log of draws
							<span key={i}>
								{i > 0 && ", "}
								{c}
							</span>
						))}
						.
					</>
				)}
			</p>
			<NullHistogram
				nulls={nulls}
				observed={obs}
				direction={direction}
				label="as tied"
			/>
			<p className="muted">
				{direction === "upper"
					? `${above} of ${nulls.length} shuffles reach ${obs} or more — the order on this khipu produces sums a shuffle rarely does.`
					: `${below} of ${nulls.length} shuffles find ${obs} or fewer — a shuffle finds at least as many sums as the real tie almost every time.`}
			</p>
			<p className="muted">
				A count on its own cannot tell the two apart — only the shuffles can.
				The full check, khipu by khipu, is in{" "}
				<Link to="/stories/what-chance-can-do">What chance can do</Link>, and
				the six null models behind it are{" "}
				<Link to={CHAPTER_PATH["against-chance"]}>next</Link>.
			</p>
			<p className="muted">
				Source: src/lib/stories/chance.ts (pendantSums, shuffled),
				public/data/stories/chance.json
			</p>
		</div>
	);
}
