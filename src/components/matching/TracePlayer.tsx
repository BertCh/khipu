import type { KeyboardEvent, ReactNode } from "react";
import type { TraceSpeed, UseTraceState } from "./useTrace";

/**
 * The transport bar for a `useTrace` figure: play/pause, step ±1, a
 * scrubber (with tick marks at `ticks`), a speed toggle, a step counter and
 * an `aria-live` caption. Visual language matches Scenes.tsx's `.scene-bar`
 * (same classes, reused — see src/styles/matching/base.css for the extras:
 * the scrubber and the speed toggle).
 */
export function TracePlayer({
	state,
	ticks,
	caption,
	speeds = [1, 4, 16],
	label = "Trace",
	children,
}: {
	state: UseTraceState;
	/** step indices worth a tick mark on the scrubber (e.g. where a run completes) */
	ticks?: number[];
	caption?: ReactNode;
	speeds?: TraceSpeed[];
	/** accessible name for the transport group */
	label?: string;
	children: ReactNode;
}) {
	const { step, setStep, playing, toggle, speed, setSpeed, ref, nSteps } =
		state;
	const listId = `trace-ticks-${label.replace(/\s+/g, "-").toLowerCase()}`;

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const t = e.target as HTMLElement;
		// a focused range input already handles its own arrow keys
		if (t instanceof HTMLInputElement && t.type === "range") return;
		if (e.key === " ") {
			e.preventDefault();
			toggle();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			setStep((s) => s - 1);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			setStep((s) => s + 1);
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: onKeyDown only catches key events bubbling up from the transport's own buttons and range input, each already natively focusable, so space/←/→ work wherever focus already is
		<div className="trace-player" ref={ref} onKeyDown={onKeyDown}>
			{children}
			<div className="scene-bar trace-bar">
				<button
					type="button"
					className="btn scene-btn"
					onClick={toggle}
					aria-label={playing ? "Pause" : "Play"}
					aria-pressed={playing}
				>
					{playing ? "❚❚" : "▶"}
				</button>
				<button
					type="button"
					className="btn scene-btn"
					onClick={() => setStep((s) => s - 1)}
					disabled={step === 0}
					aria-label="Step back"
				>
					‹
				</button>
				<input
					type="range"
					className="trace-scrubber"
					min={0}
					max={Math.max(0, nSteps - 1)}
					value={step}
					step={1}
					list={ticks?.length ? listId : undefined}
					onChange={(e) => setStep(Number(e.target.value))}
					aria-label="Step"
				/>
				{ticks && ticks.length > 0 && (
					<datalist id={listId}>
						{ticks.map((t) => (
							<option key={t} value={t} />
						))}
					</datalist>
				)}
				<button
					type="button"
					className="btn scene-btn"
					onClick={() => setStep((s) => s + 1)}
					disabled={step >= nSteps - 1}
					aria-label="Step forward"
				>
					›
				</button>
				<span className="scene-count">
					{Math.min(step + 1, nSteps)} / {nSteps}
				</span>
				<fieldset className="trace-speeds">
					<legend className="sr-only">Speed</legend>
					{speeds.map((s) => (
						<button
							key={s}
							type="button"
							className="btn trace-speed-btn"
							aria-pressed={speed === s}
							onClick={() => setSpeed(s)}
						>
							{s}×
						</button>
					))}
				</fieldset>
			</div>
			{caption && (
				<p className="scene-caption trace-caption" aria-live="polite">
					{caption}
				</p>
			)}
		</div>
	);
}

export default TracePlayer;
