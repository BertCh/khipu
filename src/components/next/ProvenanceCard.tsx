import { type ReactNode, useState } from "react";
import {
	DEFAULT_SEED,
	ENGINE_VERSION,
	fullSpec,
} from "#/lib/engine/hypothesis";
import { useEngineStatus } from "#/lib/engine/useEngine";
import { seal } from "#/lib/next/notebook";
import type {
	Claim,
	Hypothesis,
	PreregCard,
	RunResult,
	SealedCard,
	Spec,
} from "#/lib/next/types";
import "#/styles/next/engine.css";

function specText(spec: Spec): string {
	const e = Object.entries(spec);
	return e.length ? e.map(([k, v]) => `${k}=${String(v)}`).join(" · ") : "–";
}

function safeName(s: string): string {
	return (
		s
			.replace(/[^A-Za-z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 80) || "claim"
	);
}

function download(text: string, name: string): void {
	const url = URL.createObjectURL(
		new Blob([text], { type: "application/json" }),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Where a result came from, precisely enough to re-run it elsewhere. */
export default function ProvenanceCard({
	claim,
	hypothesis: h,
	result,
}: {
	claim: Claim;
	hypothesis?: Hypothesis;
	result?: RunResult;
}) {
	const status = useEngineStatus();
	const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
	const [sealed, setSealed] = useState<SealedCard | null>(null);
	const [sealError, setSealError] = useState<string | null>(null);
	const p = result?.provenance;
	const spec: Spec | null = p?.spec ?? (h ? fullSpec(h) : null);
	const dataHash = p?.dataHash ?? status.dataHash ?? "";

	const cite = async () => {
		const ok = await copyText(
			`${location.href} · data ${dataHash || "unknown"}`,
		);
		setCopied(ok ? "ok" : "fail");
		setTimeout(() => setCopied(null), 2000);
	};

	const sealIt = async () => {
		if (!h || !spec) return;
		setSealError(null);
		const card: PreregCard = {
			statement: claim.statement,
			hypothesisId: h.id,
			spec,
			direction: h.expected?.direction === "chance" ? "chance" : "above",
			threshold: 0.01,
			R: p?.R ?? h.R,
			seed: p?.seed ?? DEFAULT_SEED,
			dataHash,
			created: new Date().toISOString(),
		};
		try {
			const s = await seal(card);
			setSealed(s);
			download(
				`${JSON.stringify(s, null, 1)}\n`,
				`prereg-${safeName(claim.id)}-${s.sha256.slice(0, 8)}.json`,
			);
		} catch (e) {
			setSealError(e instanceof Error ? e.message : String(e));
		}
	};

	const rows: [string, ReactNode, boolean?][] = [
		["Claim", claim.id, true],
		["Hypothesis", h?.id ?? "none: not reproducible here", !!h],
		["Engine", p?.engine ?? ENGINE_VERSION, true],
		["Data hash", dataHash || "–", true],
		["Spec", spec ? specText(spec) : "–", true],
		["Seed", p ? String(p.seed) : h ? `${DEFAULT_SEED} (default)` : "–"],
		[
			"Replicates (R)",
			p ? p.R.toLocaleString("en") : h ? `${h.R} (default)` : "–",
		],
		["Workers", p ? (p.workers ? String(p.workers) : "main thread") : "–"],
		["Time", p ? `${p.ms.toLocaleString("en")} ms` : "–"],
		["Run at", p?.at ?? "not run yet"],
		["Recorded source", h?.expected?.source ?? "–"],
		["Script", claim.script ?? "–", !!claim.script],
		["Python equivalent", h?.python ?? "–", !!h?.python],
	];

	return (
		<section className="prov-card" aria-label="Provenance">
			<dl className="prov-list">
				{rows.map(([k, v, mono]) => (
					<div key={k} className="prov-row">
						<dt>{k}</dt>
						<dd className={mono ? "prov-mono" : undefined}>{v}</dd>
					</div>
				))}
			</dl>
			<div className="prov-actions">
				<button type="button" className="btn" onClick={cite}>
					{copied === "ok"
						? "Copied"
						: copied === "fail"
							? "Copy failed"
							: "Copy citation"}
				</button>
				<button
					type="button"
					className="btn"
					onClick={sealIt}
					disabled={!h || !dataHash}
				>
					Seal as prediction
				</button>
			</div>
			{sealed ? (
				<p className="prov-sealed" aria-live="polite">
					Sealed: SHA-256{" "}
					<code className="prov-mono prov-hash">{sealed.sha256}</code>. The card
					was downloaded as{" "}
					<code>
						prereg-{safeName(claim.id)}-{sealed.sha256.slice(0, 8)}.json
					</code>
					.
				</p>
			) : null}
			{sealError ? (
				<p className="prov-error" role="alert">
					{sealError}
				</p>
			) : null}
			<p className="prov-note">
				A sealed card becomes a pre-registration once committed to git; there is
				no server. The hash covers the card's canonical JSON (keys sorted), so
				anyone can recompute it.
			</p>
		</section>
	);
}
