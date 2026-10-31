import { LIVE_TEXT, type LiveLabel, STATUS_TEXT } from "#/lib/next/claims";
import type { ClaimStatus } from "#/lib/next/types";

/**
 * A claim's recorded status (what the site said) or its live label (what the
 * engine found here). Every chip carries a glyph as well as a colour, so the
 * two never rely on hue alone.
 */
type Props =
	| { status: ClaimStatus; live?: never; title?: string; compact?: boolean }
	| { live: LiveLabel; status?: never; title?: string; compact?: boolean };

const STATUS_GLYPH: Record<ClaimStatus, string> = {
	held: "●",
	fell: "✕",
	likely: "◐",
	open: "○",
	"published-prior": "◇",
};

const STATUS_WORD: Record<ClaimStatus, string> = {
	held: "held",
	fell: "fell",
	likely: "likely",
	open: "open",
	"published-prior": "published",
};

const LIVE_GLYPH: Record<LiveLabel, string> = {
	holds: "✓",
	drifted: "≈",
	weak: "∼",
	contradicted: "✕",
	exploratory: "◌",
	"not reproducible here": "–",
	superseded: "→",
	"not run": "○",
};

const LIVE_CLASS: Record<LiveLabel, string> = {
	holds: "ok",
	drifted: "drift",
	weak: "weak",
	contradicted: "contra",
	exploratory: "explore",
	"not reproducible here": "none",
	superseded: "superseded",
	"not run": "none",
};

export default function StatusChip(p: Props) {
	if (p.status !== undefined) {
		const s = p.status;
		return (
			<span
				className={`status-chip rec-${s}${p.compact ? " is-compact" : ""}`}
				title={p.title ?? STATUS_TEXT[s]}
			>
				<i aria-hidden="true">{STATUS_GLYPH[s]}</i>
				<span>{STATUS_WORD[s]}</span>
			</span>
		);
	}
	const l = p.live;
	return (
		<span
			className={`status-chip live-${LIVE_CLASS[l]}${p.compact ? " is-compact" : ""}`}
			title={p.title ?? LIVE_TEXT[l]}
		>
			<i aria-hidden="true">{LIVE_GLYPH[l]}</i>
			<span>{l}</span>
		</span>
	);
}
