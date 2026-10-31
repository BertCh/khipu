/**
 * Dynamic resolution, the safety net under the renderer's own economies:
 * when frames keep coming too slowly, draw fewer pixels.
 *
 * Fed the time of every rendered frame, it keeps the intervals between
 * consecutive ones (a gap long enough to be an idle spell — the loop skips
 * frames whose inputs did not change — is not an interval). If the 90th
 * percentile over the last WINDOW stays above SLOW, the canvas's pixel
 * ratio steps down one rung (never below 1); after STEADY of frames at the
 * display's pace it tries the rung above again. A rung that proved too slow
 * is not retried for BACKOFF, so a machine on the edge does not see the
 * resolution pump.
 *
 * rAF intervals cannot show headroom below the display's refresh, so
 * "fast" means "keeping up with vsync" (p90 under FAST).
 */

const WINDOW = 2000;
const SLOW = 20;
const FAST = 18;
const STEADY = 5000;
const BACKOFF = 30_000;
/** an interval longer than this is an idle spell, not a slow frame */
const IDLE_GAP = 250;
/** pixel-ratio rungs below the display's own, in steps of about a sixth of the pixels */
const RUNGS = [2, 1.75, 1.5, 1.25, 1];

export class QualityGovernor {
	/** the pixel ratios to use, native first */
	private readonly ladder: number[];
	private rung = 0;
	private readonly apply: (ratio: number) => void;
	private times: number[] = [];
	private intervals: number[] = [];
	private last = -1;
	/** when the current rung was taken (or the window last restarted) */
	private since = 0;
	/** per rung: until when stepping up to it is off */
	private readonly bannedUntil: number[];

	/**
	 * `apply` sets the drawing buffer to css size × ratio; `native` is the
	 * display's device pixel ratio (the top rung).
	 */
	constructor(
		apply: (ratio: number) => void,
		native = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
	) {
		this.apply = apply;
		this.ladder = [native, ...RUNGS.filter((r) => r < native - 0.01)];
		this.bannedUntil = this.ladder.map(() => 0);
	}

	/** The pixel ratio in use. */
	get ratio(): number {
		return this.ladder[this.rung];
	}

	/** Call once per rendered frame with its timestamp (rAF time, ms). */
	frame(time: number): void {
		const dt = time - this.last;
		this.last = time;
		if (dt <= 0 || dt > IDLE_GAP) return;
		this.times.push(time);
		this.intervals.push(dt);
		// keep the window
		let drop = 0;
		while (drop < this.times.length && this.times[drop] < time - WINDOW) drop++;
		if (drop > 0) {
			this.times.splice(0, drop);
			this.intervals.splice(0, drop);
		}
		// a judgement needs a full window of frames at this rung
		if (time - this.since < WINDOW || this.intervals.length < 20) return;
		const sorted = [...this.intervals].sort((a, b) => a - b);
		const p90 = sorted[Math.floor(sorted.length * 0.9)];
		if (p90 > SLOW && this.rung < this.ladder.length - 1) {
			// too slow here: this rung is off for a while, go down one
			this.bannedUntil[this.rung] = time + BACKOFF;
			this.step(this.rung + 1, time);
		} else if (
			p90 < FAST &&
			this.rung > 0 &&
			time - this.since > STEADY &&
			time > this.bannedUntil[this.rung - 1]
		) {
			this.step(this.rung - 1, time);
		}
	}

	private step(rung: number, time: number): void {
		this.rung = rung;
		this.since = time;
		this.times = [];
		this.intervals = [];
		this.apply(this.ladder[rung]);
	}
}
