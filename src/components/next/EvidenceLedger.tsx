import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import StatusChip from "#/components/next/StatusChip";
import { useSpecSummaries, useVerdicts } from "#/lib/engine/useEngine";
import {
	certainty,
	claimVerdict,
	DOWNGRADE_TEXT,
	hypothesisFor,
	type LiveLabel,
	liveLabel,
} from "#/lib/next/claims";
import { useNotebook } from "#/lib/next/notebook";
import type { PGSearch } from "#/lib/next/search";
import type {
	Claim,
	ClaimKind,
	ClaimStatus,
	Hypothesis,
	VerdictRecord,
} from "#/lib/next/types";
import type { StrandFile } from "#/lib/stories/strands";

/**
 * The evidence grid: one row per claim, recorded status beside the live
 * label, and the small marks (null p, robustness, lineup, prior, certainty)
 * that say how far each claim has been pushed. Filters live in the URL;
 * the sort order is a per-view convenience and stays local.
 */

export type SearchPatch = Partial<PGSearch>;

interface Props {
	claims: Claim[];
	strands?: StrandFile;
	search: PGSearch;
	onSearch: (patch: SearchPatch, opts?: { replace?: boolean }) => void;
	/** the resolved claim id when `search.claim` is an alias such as "pair:A|B" */
	selected?: string;
}

export const KIND_TEXT: Record<ClaimKind, string> = {
	link: "link",
	reading: "reading",
	grammar: "grammar",
	"null-result": "null result",
	"data-correction": "data correction",
	method: "method",
};

const KINDS: ClaimKind[] = [
	"link",
	"reading",
	"grammar",
	"null-result",
	"data-correction",
	"method",
];
const STATUSES: ClaimStatus[] = [
	"held",
	"likely",
	"open",
	"fell",
	"published-prior",
];
const STATUS_WORD: Record<ClaimStatus, string> = {
	held: "held",
	likely: "likely",
	open: "open",
	fell: "fell",
	"published-prior": "published",
};

const FILTERS: { key: NonNullable<PGSearch["filter"]>; label: string }[] = [
	{ key: "live", label: "live" },
	{ key: "drift", label: "drift" },
	{ key: "controls", label: "controls" },
	{ key: "open-work", label: "open work" },
];

/** lower sorts first: problems, then confirmations, then the rest */
const LIVE_RANK: Record<LiveLabel, number> = {
	contradicted: 0,
	drifted: 1,
	weak: 2,
	holds: 3,
	exploratory: 4,
	"not run": 5,
	superseded: 6,
	"not reproducible here": 7,
};
const STATUS_RANK: Record<ClaimStatus, number> = {
	held: 0,
	likely: 1,
	open: 2,
	fell: 3,
	"published-prior": 4,
};
const KIND_RANK: Record<ClaimKind, number> = {
	link: 0,
	reading: 1,
	grammar: 2,
	"null-result": 3,
	"data-correction": 4,
	method: 5,
};

export interface LedgerRow {
	claim: Claim;
	h?: Hypothesis;
	v?: VerdictRecord;
	live: LiveLabel;
	p: number | null;
	robust: number | null;
	lineup: [number, number] | null;
	prior: boolean;
	cert: 1 | 2 | 3 | 4;
	openWork: boolean;
}

type SortKey =
	| "default"
	| "claim"
	| "kind"
	| "recorded"
	| "live"
	| "null"
	| "robust"
	| "lineup"
	| "prior"
	| "repro"
	| "certainty";

/**
 * The desktop table keeps five columns so it fits its pane; kind, id,
 * reproducibility, certainty, lineup and prior sit on the line under the
 * statement, and every key stays sortable from the Sort menu.
 */
const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
	{ key: "claim", label: "Claim" },
	{ key: "recorded", label: "Recorded" },
	{ key: "live", label: "Live" },
	{ key: "null", label: "Null", className: "num" },
	{ key: "robust", label: "Robust" },
];

const SORT_TEXT: Record<SortKey, string> = {
	default: "live first",
	claim: "id",
	kind: "kind",
	recorded: "recorded status",
	live: "live label",
	null: "null p",
	robust: "robustness",
	lineup: "lineup trials",
	prior: "prior work",
	repro: "reproducibility",
	certainty: "certainty",
};

/** phone cards are shown this many at a time */
const CARD_PAGE = 30;

function safeHypothesis(c: Claim): Hypothesis | undefined {
	try {
		return hypothesisFor(c);
	} catch {
		return undefined;
	}
}

/** Build the per-claim rows the ledger and the stat tiles share. */
export function useLedgerRows(
	claims: Claim[],
	strands?: StrandFile,
): LedgerRow[] {
	const verdicts = useVerdicts();
	const summaries = useSpecSummaries();
	const { trials } = useNotebook();
	const hyps = useMemo(
		() => new Map(claims.map((c) => [c.id, safeHypothesis(c)])),
		[claims],
	);
	return useMemo(() => {
		const tally = new Map<string, [number, number]>();
		for (const t of trials) {
			const k = tally.get(t.hypothesisId) ?? [0, 0];
			k[0] += t.correct ? 1 : 0;
			k[1] += 1;
			tally.set(t.hypothesisId, k);
		}
		return claims.map((claim) => {
			const h = hyps.get(claim.id);
			const v = claimVerdict(claim, verdicts);
			const threads = claim.pair
				? (strands?.links[claim.pair]?.threads.length ?? 0)
				: 0;
			return {
				claim,
				h,
				v,
				live: liveLabel(claim, v),
				p: v?.p ?? null,
				robust: h ? (summaries[h.id]?.robustShare ?? null) : null,
				lineup: h ? (tally.get(h.id) ?? null) : null,
				prior:
					claim.status === "published-prior" ||
					claim.downgrades.includes("prior-art"),
				cert: certainty(claim, v),
				openWork:
					claim.status === "open" ||
					(claim.kind === "link" && threads === 0) ||
					claim.repro === "manual" ||
					claim.repro === "scratchpad" ||
					claim.repro === "none",
			};
		});
	}, [claims, hyps, verdicts, summaries, trials, strands]);
}

function compare(a: LedgerRow, b: LedgerRow, key: SortKey): number {
	switch (key) {
		case "default":
			return (
				(a.h ? 0 : 1) - (b.h ? 0 : 1) ||
				KIND_RANK[a.claim.kind] - KIND_RANK[b.claim.kind] ||
				STATUS_RANK[a.claim.status] - STATUS_RANK[b.claim.status]
			);
		case "claim":
			return a.claim.id.localeCompare(b.claim.id);
		case "kind":
			return KIND_RANK[a.claim.kind] - KIND_RANK[b.claim.kind];
		case "recorded":
			return STATUS_RANK[a.claim.status] - STATUS_RANK[b.claim.status];
		case "live":
			return LIVE_RANK[a.live] - LIVE_RANK[b.live];
		case "null":
			return (a.p ?? 2) - (b.p ?? 2);
		case "robust":
			return (b.robust ?? -1) - (a.robust ?? -1);
		case "lineup":
			return (b.lineup?.[1] ?? 0) - (a.lineup?.[1] ?? 0);
		case "prior":
			return Number(b.prior) - Number(a.prior);
		case "repro":
			return a.claim.repro.localeCompare(b.claim.repro);
		case "certainty":
			return b.cert - a.cert;
	}
}

export function formatP(p: number | null, R?: number): string {
	if (p == null) return "—";
	if (R != null && R > 0 && p <= 1 / (R + 1) + 1e-12)
		return `< ${Number((1 / (R + 1)).toPrecision(2)).toLocaleString("en")}`;
	if (p < 0.0001) return p.toExponential(1);
	return Number(p.toPrecision(2)).toLocaleString("en", {
		maximumSignificantDigits: 2,
	});
}

export function matchesQuery(c: Claim, q: string): boolean {
	const s = q.trim().toLowerCase();
	if (!s) return true;
	return (
		c.statement.toLowerCase().includes(s) ||
		c.id.toLowerCase().includes(s) ||
		c.khipus.some((k) => k.toLowerCase().includes(s))
	);
}

export default function EvidenceLedger({
	claims,
	strands,
	search,
	onSearch,
	selected = search.claim,
}: Props) {
	const rows = useLedgerRows(claims, strands);
	const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
		key: "default",
		dir: 1,
	});
	const [cards, setCards] = useState(CARD_PAGE);
	const scrollRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		const out = rows.filter((r) => {
			const c = r.claim;
			if (search.kind && c.kind !== search.kind) return false;
			if (search.status && c.status !== search.status) return false;
			if (search.filter === "live" && !r.h) return false;
			if (
				search.filter === "drift" &&
				!(
					r.v?.verdict === "drift" ||
					r.v?.verdict === "weak" ||
					r.v?.verdict === "contradicts"
				)
			)
				return false;
			if (search.filter === "controls" && !c.control) return false;
			if (search.filter === "open-work" && !r.openWork) return false;
			if (search.q && !matchesQuery(c, search.q)) return false;
			return true;
		});
		return out.sort(
			(a, b) =>
				sort.dir * compare(a, b, sort.key) ||
				compare(a, b, "default") ||
				a.claim.id.localeCompare(b.claim.id),
		);
	}, [rows, search, sort]);

	// a new filter starts the phone list again from the top
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter change
	useEffect(() => {
		setCards(CARD_PAGE);
	}, [search.kind, search.status, search.filter, search.q]);

	// bring the selected row into the ledger pane (the pane scrolls, not the window)
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the rows change
	useEffect(() => {
		const sc = scrollRef.current;
		if (!sc || !selected || sc.scrollHeight <= sc.clientHeight + 1) return;
		const row = sc.querySelector<HTMLElement>("tr.is-selected");
		if (!row) return;
		const head = sc.querySelector("thead")?.getBoundingClientRect().height ?? 0;
		const top =
			row.getBoundingClientRect().top - sc.getBoundingClientRect().top;
		const bottom = top + row.getBoundingClientRect().height;
		if (top < head || bottom > sc.clientHeight)
			sc.scrollTop += top - head - (sc.clientHeight - head) / 3;
	}, [selected, filtered.length]);

	// the selected card is always among those shown
	const selIndex = filtered.findIndex((r) => r.claim.id === selected);
	const shownCards = Math.max(cards, selIndex + 1);

	const kindCount = useMemo(() => {
		const m = new Map<ClaimKind, number>();
		for (const r of rows) m.set(r.claim.kind, (m.get(r.claim.kind) ?? 0) + 1);
		return m;
	}, [rows]);
	const statusCount = useMemo(() => {
		const m = new Map<ClaimStatus, number>();
		for (const r of rows)
			m.set(r.claim.status, (m.get(r.claim.status) ?? 0) + 1);
		return m;
	}, [rows]);

	const select = (id: string) => onSearch({ claim: id });
	const onRowKey = (e: KeyboardEvent<HTMLElement>, id: string) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			select(id);
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const sib =
				e.key === "ArrowDown"
					? e.currentTarget.nextElementSibling
					: e.currentTarget.previousElementSibling;
			if (sib instanceof HTMLElement) sib.focus();
		}
	};
	const sortBy = (key: SortKey) =>
		setSort((s) =>
			s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 },
		);
	const hasFilter = !!(
		search.kind ||
		search.status ||
		search.filter ||
		search.q
	);

	return (
		<section className="pg-ledger" aria-label="Evidence ledger">
			<div className="ledger-filters">
				<input
					type="search"
					className="ledger-search"
					placeholder="Search statements, ids, khipus"
					aria-label="Search claims"
					value={search.q ?? ""}
					onChange={(e) =>
						onSearch({ q: e.target.value || undefined }, { replace: true })
					}
				/>
				<fieldset className="ledger-chip-row">
					<legend>Kind</legend>
					{KINDS.filter((k) => kindCount.has(k)).map((k) => (
						<button
							key={k}
							type="button"
							className="btn btn-chip"
							aria-pressed={search.kind === k}
							onClick={() =>
								onSearch({ kind: search.kind === k ? undefined : k })
							}
						>
							{KIND_TEXT[k]}{" "}
							<span className="btn-count">{kindCount.get(k)}</span>
						</button>
					))}
				</fieldset>
				<fieldset className="ledger-chip-row">
					<legend>Recorded</legend>
					{STATUSES.filter((s) => statusCount.has(s)).map((s) => (
						<button
							key={s}
							type="button"
							className="btn btn-chip"
							aria-pressed={search.status === s}
							onClick={() =>
								onSearch({ status: search.status === s ? undefined : s })
							}
						>
							{STATUS_WORD[s]}{" "}
							<span className="btn-count">{statusCount.get(s)}</span>
						</button>
					))}
				</fieldset>
				<fieldset className="ledger-chip-row">
					<legend>Show</legend>
					{FILTERS.map((f) => (
						<button
							key={f.key}
							type="button"
							className="btn btn-chip"
							aria-pressed={search.filter === f.key}
							onClick={() =>
								onSearch({
									filter: search.filter === f.key ? undefined : f.key,
								})
							}
						>
							{f.label}
						</button>
					))}
				</fieldset>
				<p className="ledger-count" aria-live="polite">
					<span>
						{filtered.length.toLocaleString("en")} of{" "}
						{rows.length.toLocaleString("en")} claims
					</span>
					<label className="ledger-sort">
						<span>Sort</span>
						<select
							value={`${sort.key}:${sort.dir}`}
							onChange={(e) => {
								const [k, d] = e.target.value.split(":");
								setSort({ key: k as SortKey, dir: d === "-1" ? -1 : 1 });
							}}
						>
							{(Object.keys(SORT_TEXT) as SortKey[]).flatMap((k) => [
								<option key={`${k}:1`} value={`${k}:1`}>
									{SORT_TEXT[k]}
								</option>,
								k === "default" ? null : (
									<option key={`${k}:-1`} value={`${k}:-1`}>
										{SORT_TEXT[k]}, reversed
									</option>
								),
							])}
						</select>
					</label>
					{hasFilter && (
						<button
							type="button"
							className="linkish"
							onClick={() =>
								onSearch({
									kind: undefined,
									status: undefined,
									filter: undefined,
									q: undefined,
								})
							}
						>
							clear filters
						</button>
					)}
				</p>
			</div>

			<div className="ledger-scroll table-wrap" ref={scrollRef}>
				<table className="data-table ledger-table">
					<thead>
						<tr>
							{COLUMNS.map((col) => (
								<th
									key={col.key}
									className={col.className}
									aria-sort={
										sort.key === col.key
											? sort.dir === 1
												? "ascending"
												: "descending"
											: undefined
									}
								>
									<button type="button" onClick={() => sortBy(col.key)}>
										{col.label}
									</button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{filtered.map((r) => {
							const c = r.claim;
							const sel = selected === c.id;
							return (
								<tr
									key={c.id}
									className={sel ? "is-selected" : undefined}
									aria-selected={sel}
									tabIndex={0}
									onClick={() => select(c.id)}
									onKeyDown={(e) => onRowKey(e, c.id)}
								>
									<td className="ledger-claim">
										<ClaimCell row={r} onSuccessor={(id) => select(id)} />
									</td>
									<td>
										<StatusChip status={c.status} compact />
									</td>
									<td>
										<StatusChip live={r.live} compact title={r.v?.note} />
									</td>
									<td className="num">
										<NullDot p={r.p} verdict={r.v?.verdict} />
									</td>
									<td>
										<RobustBar share={r.robust} />
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
				{filtered.length === 0 && (
					<p className="ledger-empty">No claims match these filters.</p>
				)}
			</div>

			<ul className="ledger-cards">
				{filtered.slice(0, shownCards).map((r) => {
					const c = r.claim;
					const sel = selected === c.id;
					return (
						<li key={c.id}>
							<button
								type="button"
								className={`ledger-card${sel ? " is-selected" : ""}`}
								aria-current={sel ? "true" : undefined}
								onClick={() => select(c.id)}
							>
								<span
									className={`ledger-card-statement${c.supersededBy ? " is-superseded" : ""}`}
								>
									{c.statement}
								</span>
								<span className="ledger-card-chips">
									<StatusChip status={c.status} compact />
									<StatusChip live={r.live} compact />
									<span className="ledger-card-kind">{KIND_TEXT[c.kind]}</span>
								</span>
								<EvidenceDots row={r} />
							</button>
						</li>
					);
				})}
				{filtered.length === 0 && (
					<li className="ledger-empty">No claims match these filters.</li>
				)}
				{filtered.length > shownCards && (
					<li className="ledger-more">
						<button
							type="button"
							className="btn"
							onClick={() => setCards(shownCards + CARD_PAGE)}
						>
							Show {Math.min(CARD_PAGE, filtered.length - shownCards)} more of{" "}
							{(filtered.length - shownCards).toLocaleString("en")}
						</button>
					</li>
				)}
			</ul>
		</section>
	);
}

function ClaimCell({
	row,
	onSuccessor,
}: {
	row: LedgerRow;
	onSuccessor: (id: string) => void;
}) {
	const claim = row.claim;
	return (
		<>
			<span
				className={`ledger-statement${claim.supersededBy ? " is-superseded" : ""}`}
			>
				{claim.statement}
			</span>
			<span className="ledger-meta">
				<Certainty claim={claim} value={row.cert} />
				<span>{KIND_TEXT[claim.kind]}</span>
				<span className="ledger-repro">{claim.repro}</span>
				{row.lineup && (
					<span>
						lineup {row.lineup[0]}/{row.lineup[1]}
					</span>
				)}
				{row.prior && <span>published</span>}
			</span>
			<span className="ledger-id">
				{claim.id}
				{claim.supersededBy && (
					<>
						{" "}
						<button
							type="button"
							className="linkish"
							onClick={(e) => {
								e.stopPropagation();
								if (claim.supersededBy) onSuccessor(claim.supersededBy);
							}}
						>
							→ {claim.supersededBy}
						</button>
					</>
				)}
			</span>
		</>
	);
}

/** A dot whose radius grows with −log10 p (capped at 4); hollow before a run. */
export function NullDot({
	p,
	verdict,
	size = 22,
}: {
	p: number | null;
	verdict?: VerdictRecord["verdict"];
	size?: number;
}) {
	const c = size / 2;
	const ran = p != null;
	const strength = ran ? Math.min(4, -Math.log10(Math.max(p, 1e-12))) : 0;
	const r = ran ? 1.6 + (strength / 4) * (c - 2.6) : c / 3;
	const tone =
		verdict === "contradicts"
			? "var(--verdict-contra)"
			: verdict === "drift"
				? "var(--verdict-drift)"
				: verdict === "weak"
					? "var(--verdict-weak)"
					: ran && (p ?? 1) < 0.05
						? "var(--verdict-ok)"
						: "var(--verdict-none)";
	return (
		<svg
			className="null-dot"
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={ran ? `p ${formatP(p)}` : "not run"}
		>
			<title>{ran ? `p ${formatP(p)}` : "not run"}</title>
			<circle
				cx={c}
				cy={c}
				r={r}
				fill={ran ? tone : "none"}
				stroke={ran ? "none" : "var(--verdict-none)"}
				strokeWidth={1.2}
			/>
		</svg>
	);
}

function RobustBar({ share }: { share: number | null }) {
	if (share == null) return <span className="ledger-muted">—</span>;
	const pct = Math.round(share * 100);
	return (
		<span
			className="robust-bar"
			title={`holds in ${pct}% of the specifications that keep the claim`}
		>
			<span className="robust-bar-track">
				<span className="robust-bar-fill" style={{ width: `${pct}%` }} />
			</span>
			<span className="robust-bar-num">{pct}%</span>
		</span>
	);
}

export function Certainty({
	claim,
	value,
}: {
	claim: Claim;
	value: 1 | 2 | 3 | 4;
}) {
	const tip = claim.downgrades.length
		? `Certainty ${value} of 4. Downgrades: ${claim.downgrades
				.map((d) => DOWNGRADE_TEXT[d])
				.join("; ")}`
		: `Certainty ${value} of 4. No downgrades recorded.`;
	return (
		<span className="certainty" title={tip} role="img" aria-label={tip}>
			{[1, 2, 3, 4].map((i) => (
				<i key={i} className={i <= value ? "is-on" : undefined} />
			))}
		</span>
	);
}

/** The five marks of the phone card: run, beats chance, robust, lineup, prior. */
function EvidenceDots({ row }: { row: LedgerRow }) {
	const marks: { label: string; on: boolean }[] = [
		{ label: "live test", on: !!row.h },
		{ label: "beats chance (p < .05)", on: row.p != null && row.p < 0.05 },
		{ label: "robust across specifications", on: (row.robust ?? 0) >= 0.5 },
		{ label: "lineup tried", on: (row.lineup?.[1] ?? 0) > 0 },
		{ label: "published before", on: row.prior },
	];
	const text = marks
		.map((m) => `${m.label}: ${m.on ? "yes" : "no"}`)
		.join("; ");
	return (
		<span className="evidence-dots" role="img" aria-label={text} title={text}>
			{marks.map((m) => (
				<i key={m.label} className={m.on ? "is-on" : undefined} />
			))}
		</span>
	);
}
