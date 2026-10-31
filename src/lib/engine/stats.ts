/**
 * Small statistics for the /next engine: empirical tails, moments, BH,
 * a binomial tail and Foster–Stine alpha-investing. Node-importable.
 */
import type { AlphaWealth } from "../next/types.ts";

/** (1 + #null >= obs) / (1 + n): upper tail with the +1 correction */
export function upperP(obs: number, nulls: ArrayLike<number>): number {
	let ge = 0;
	for (let i = 0; i < nulls.length; i++) if (nulls[i] >= obs) ge++;
	return (1 + ge) / (1 + nulls.length);
}

/** (1 + #null <= obs) / (1 + n) */
export function lowerP(obs: number, nulls: ArrayLike<number>): number {
	let le = 0;
	for (let i = 0; i < nulls.length; i++) if (nulls[i] <= obs) le++;
	return (1 + le) / (1 + nulls.length);
}

export function mean(xs: ArrayLike<number>): number {
	if (xs.length === 0) return Number.NaN;
	let s = 0;
	for (let i = 0; i < xs.length; i++) s += xs[i];
	return s / xs.length;
}

/** sample standard deviation (n - 1); 0 for fewer than two values */
export function sd(xs: ArrayLike<number>): number {
	const n = xs.length;
	if (n < 2) return 0;
	const m = mean(xs);
	let ss = 0;
	for (let i = 0; i < n; i++) ss += (xs[i] - m) ** 2;
	return Math.sqrt(ss / (n - 1));
}

/** linear-interpolated quantile (numpy's default, type 7) */
export function quantile(xs: ArrayLike<number>, q: number): number {
	const n = xs.length;
	if (n === 0) return Number.NaN;
	const a = Float64Array.from(xs).sort();
	const h = (n - 1) * Math.min(1, Math.max(0, q));
	const lo = Math.floor(h);
	const hi = Math.min(n - 1, lo + 1);
	return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

export function zScore(obs: number, m: number, s: number): number {
	return (obs - m) / Math.max(s, 1e-9);
}

/** complementary error function (Numerical Recipes erfcc Chebyshev fit, fractional error < 1.2e-7) */
function erfc(x: number): number {
	const z = Math.abs(x);
	const t = 1 / (1 + 0.5 * z);
	const r =
		t *
		Math.exp(
			-z * z -
				1.26551223 +
				t *
					(1.00002368 +
						t *
							(0.37409196 +
								t *
									(0.09678418 +
										t *
											(-0.18628806 +
												t *
													(0.27886807 +
														t *
															(-1.13520398 +
																t *
																	(1.48851587 +
																		t * (-0.82215223 + t * 0.17087277)))))))),
		);
	return x >= 0 ? r : 2 - r;
}

/** P(Z >= z) for a standard normal */
export function normalUpper(z: number): number {
	if (Number.isNaN(z)) return Number.NaN;
	return 0.5 * erfc(z / Math.SQRT2);
}

/** Benjamini–Hochberg adjusted q-values, returned in the input order */
export function bh(ps: number[]): number[] {
	const n = ps.length;
	const order = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b]);
	const q = new Array<number>(n);
	let run = 1;
	for (let r = n - 1; r >= 0; r--) {
		const i = order[r];
		run = Math.min(run, (ps[i] * n) / (r + 1));
		q[i] = Math.min(1, run);
	}
	return q;
}

function logGamma(x: number): number {
	// Lanczos, g = 7
	const c = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028,
		771.32342877765313, -176.61502916214059, 12.507343278686905,
		-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
	];
	if (x < 0.5)
		return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
	const xx = x - 1;
	let a = c[0];
	const t = xx + 7.5;
	for (let i = 1; i < 9; i++) a += c[i] / (xx + i);
	return (
		0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a)
	);
}

/** P(X >= k) for X ~ Binomial(n, p0) */
export function binomUpper(k: number, n: number, p0: number): number {
	if (k <= 0) return 1;
	if (k > n) return 0;
	if (p0 <= 0) return 0;
	if (p0 >= 1) return 1;
	const lnC = (i: number) =>
		logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1);
	const lp = Math.log(p0);
	const lq = Math.log1p(-p0);
	let s = 0;
	for (let i = k; i <= n; i++) s += Math.exp(lnC(i) + i * lp + (n - i) * lq);
	return Math.min(1, s);
}

export function alphaStart(): AlphaWealth {
	return { wealth: 0.05, tests: 0, rejections: 0, spent: 0 };
}

/**
 * Foster–Stine alpha-investing. Bid a = w/2 / (1 + w/2); reject when p <= a;
 * the wealth pays a / (1 - a) for the test and earns the 0.05 payout back on a
 * rejection.
 */
export function alphaInvest(
	s: AlphaWealth,
	p: number,
): { state: AlphaWealth; reject: boolean; bid: number } {
	const half = Math.max(0, s.wealth) / 2;
	const bid = half / (1 + half);
	const reject = Number.isFinite(p) && p <= bid;
	const cost = bid / (1 - bid);
	return {
		state: {
			wealth: s.wealth - cost + (reject ? 0.05 : 0),
			tests: s.tests + 1,
			rejections: s.rejections + (reject ? 1 : 0),
			spent: s.spent + cost,
		},
		reject,
		bid,
	};
}
