import { useEffect, useMemo, useState } from "react";
import SumTable from "#/components/khipu/SumTable";
import SumXray, { HAND_COLOR, HAND_LABEL } from "#/components/khipu/SumXray";
import { describeColor, hexFor } from "#/lib/khipu/colors";
import { cordKindLabel } from "#/lib/khipu/describe";
import {
	COLORED_PENDANT_SUM,
	type CordSum,
	groupName,
	type Hand,
	pendantSums,
	sumStats,
} from "#/lib/khipu/fieldmarks";
import type { ColorTable, Cord, KhipuLike } from "#/lib/khipu/types";

/**
 * The coloured-pendant-sum fieldmark for one khipu, as the Field Guide shows
 * it: a sentence of statistics per hand, the x-ray with a readout beneath it,
 * and the detail table. The section owns the hover and pin state and tells
 * the page which cords are lit so the main diagram can ring them too.
 */

export interface ActiveSum {
	sum: string;
	/** summands by hand: a cord can be a sum both ways */
	summands: Partial<Record<Hand, string[]>>;
}

interface Props {
	khipu: KhipuLike;
	colors: ColorTable;
	kfgUrl?: string;
	onActive?: (active: ActiveSum | null) => void;
}

type HandFilter = "both" | Hand;

/** Up to this many sums, every thread is drawn at once; beyond it they would only tangle. */
const SHOW_ALL_UP_TO = 12;

export default function CordSums({ khipu, colors, kfgUrl, onActive }: Props) {
	const all = useMemo(() => pendantSums(khipu), [khipu]);
	const byName = useMemo(
		() => new Map(khipu.cords.map((c) => [c.name, c])),
		[khipu],
	);
	const [hand, setHand] = useState<HandFilter>("both");
	const [showAll, setShowAll] = useState(all.length <= SHOW_ALL_UP_TO);
	const [focus, setFocus] = useState<string | null>(null);
	const [hover, setHover] = useState<string | null>(null);

	const sums = useMemo(
		() => (hand === "both" ? all : all.filter((s) => s.hand === hand)),
		[all, hand],
	);
	const right = useMemo(() => all.filter((s) => s.hand === "R"), [all]);
	const left = useMemo(() => all.filter((s) => s.hand === "L"), [all]);

	// the pin may not survive a hand change
	useEffect(() => {
		if (focus && !sums.some((s) => s.sum === focus)) setFocus(null);
	}, [sums, focus]);

	const activeName = hover ?? focus;
	const activeSums = useMemo(
		() => (activeName ? sums.filter((s) => s.sum === activeName) : []),
		[activeName, sums],
	);
	useEffect(() => {
		if (!onActive) return;
		if (activeSums.length === 0) {
			onActive(null);
			return;
		}
		onActive({
			sum: activeSums[0].sum,
			summands: Object.fromEntries(activeSums.map((s) => [s.hand, s.summands])),
		});
	}, [activeSums, onActive]);

	const min = COLORED_PENDANT_SUM.minValue;
	const runOf = COLORED_PENDANT_SUM.minSummands;

	return (
		<section className="section" aria-labelledby="sums-title">
			<h2 id="sums-title">Coloured pendant sums</h2>
			<div className="prose" style={{ marginBottom: "0.9rem" }}>
				<p>
					Some cords are the total of others. Marcia Ascher noted such sums in
					her databooks, and the Khipu Field Guide searches every khipu for one
					kind of them: a cord whose value equals a run of cords{" "}
					<em>of its own colour</em> — {runOf} or more, consecutive among that
					colour's cords, so cords of other colours and cords with no value are
					stepped over and group boundaries make no difference. The run lies
					either to the sum cord's right (a{" "}
					<span className="hand hand-R">
						<i aria-hidden="true" />
						right-handed
					</span>{" "}
					sum) or to its left (
					<span className="hand hand-L">
						<i aria-hidden="true" />
						left-handed
					</span>
					); the sum cord must be {min} or more, and where several runs fit the
					shortest is kept.
				</p>
				<p>
					On the khipus checked, the search matches the Field Guide's lists cord
					for cord. Like theirs, it finds arithmetic, not intent: among many
					small values some totals will be coincidence, and a khipu with
					hundreds of sums says more about its value distribution than its
					accounting.
				</p>
			</div>

			{all.length === 0 ? (
				<p className="prose muted">
					None here: no cord of {min} or more equals {runOf} or more consecutive
					cords of its colour.
				</p>
			) : (
				<>
					<div className="diagram-tools">
						{(
							[
								["both", "Both hands", all.length],
								["R", "Right-handed", right.length],
								["L", "Left-handed", left.length],
							] as const
						).map(([key, label, n]) => (
							<button
								key={key}
								type="button"
								className="btn"
								aria-pressed={hand === key}
								onClick={() => setHand(key)}
							>
								{label} <span className="btn-count">{n}</span>
							</button>
						))}
						<span className="spacer" />
						<button
							type="button"
							className="btn"
							aria-pressed={showAll}
							onClick={() => setShowAll((v) => !v)}
							title={
								all.length > SHOW_ALL_UP_TO
									? `Off by default: ${all.length} threads would tangle`
									: undefined
							}
						>
							Draw every run
						</button>
						{focus && (
							<button
								type="button"
								className="btn"
								onClick={() => setFocus(null)}
							>
								Unpin {focus}
							</button>
						)}
						{kfgUrl && (
							<a href={kfgUrl} target="_blank" rel="noreferrer">
								Field Guide's page for this khipu ↗
							</a>
						)}
					</div>

					<div className="sum-stats">
						<StatLine hand="R" sums={right} />
						<StatLine hand="L" sums={left} />
					</div>

					<SumXray
						khipu={khipu}
						colors={colors}
						sums={sums}
						showAll={showAll}
						focus={focus}
						onFocus={setFocus}
						hover={hover}
						onHover={setHover}
					/>
					<Readout
						cord={activeName ? byName.get(activeName) : undefined}
						sums={activeSums}
						pinned={focus != null && hover == null}
						khipu={khipu}
						byName={byName}
						colors={colors}
					/>

					<SumTable
						khipu={khipu}
						colors={colors}
						sums={sums}
						focus={focus}
						onFocus={setFocus}
						hover={hover}
						onHover={setHover}
					/>
				</>
			)}
		</section>
	);
}

function StatLine({ hand, sums }: { hand: Hand; sums: CordSum[] }) {
	const st = sumStats(sums);
	const label = hand === "R" ? "Right-handed" : "Left-handed";
	return (
		<p>
			<span className={`hand hand-${hand}`}>
				<i aria-hidden="true" />
				{label}
			</span>{" "}
			{st ? (
				<>
					<b>{st.n}</b> {st.n === 1 ? "sum" : "sums"}, up to{" "}
					<b>{st.maxSummands}</b> summands,{" "}
					{st.min === st.max ? (
						<>
							value <b>{st.max}</b>
						</>
					) : (
						<>
							values <b>{st.min}</b>–<b>{st.max}</b> (mean {st.mean})
						</>
					)}
				</>
			) : (
				<span className="muted">none</span>
			)}
		</p>
	);
}

/**
 * What the pointer is on, written out under the x-ray rather than in a box
 * that would cover the very cells being looked at: the cord's record in one
 * line, then each sum it is the total of, as an equation in run order.
 */
function Readout({
	cord,
	sums,
	pinned,
	khipu,
	byName,
	colors,
}: {
	cord: Cord | undefined;
	sums: CordSum[];
	pinned: boolean;
	khipu: KhipuLike;
	byName: Map<string, Cord>;
	colors: ColorTable;
}) {
	if (!cord) {
		return (
			<div className="sum-readout muted">
				<p>
					A column per group, a square per cord in its recorded colour; hollow
					squares have no value and top cords stand above the primary cord. Sum
					cords are outlined, with an arrowhead towards their summands. Hover
					one to see its run, click to keep it.
				</p>
			</div>
		);
	}
	const swatches = cord.colorParsed?.flatMap((s) => s.codes) ?? [];
	return (
		<div className="sum-readout">
			<p className="sum-readout-cord">
				<strong>{cord.name}</strong>
				<span className="muted"> · {groupName(cord, khipu.groups)}</span>
				<span className="muted"> · {cordKindLabel(cord).toLowerCase()}</span>
				{" · "}
				<span className="kd-swatches">
					{swatches.map((code, i) => (
						<i
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							style={{ background: hexFor(code, colors) }}
						/>
					))}
				</span>{" "}
				{cord.color ?? "—"}
				<span className="muted">
					{" "}
					{describeColor(cord.colorParsed, colors)}
				</span>
				{" · value "}
				<strong>
					{cord.value != null ? cord.value.toLocaleString() : "—"}
				</strong>
				{pinned && <span className="muted"> · pinned</span>}
			</p>
			{sums.length > 0 ? (
				sums.map((s) => (
					<p key={s.hand} className="sum-readout-sum">
						<span className={`hand hand-${s.hand}`}>
							<i aria-hidden="true" />
							{HAND_LABEL[s.hand]}
						</span>
						<span className="sum-readout-eq">
							<b style={{ color: HAND_COLOR[s.hand] }}>{s.value}</b>
							<span className="muted"> = </span>
							{s.summands.map((n, i) => {
								const c = byName.get(n);
								return (
									<span key={n}>
										{i > 0 && <span className="muted"> + </span>}
										<span className="sum-term">
											<b>{c?.value ?? "?"}</b>
											<span className="muted">
												{" "}
												{n}
												{c && ` (${groupName(c, khipu.groups)})`}
											</span>
										</span>
									</span>
								);
							})}
						</span>
					</p>
				))
			) : (
				<p className="muted">
					{cord.value
						? "Not the sum of a run of its colour."
						: "No value, so the search steps over it."}
				</p>
			)}
		</div>
	);
}
