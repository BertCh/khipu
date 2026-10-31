/* Smith-Waterman local alignment (Gotoh affine gaps) over value-index sequences with a
   precomputed substitution table.  Used by scripts/deep/align_scan.py via ctypes.
   build: cc -O3 -shared -fPIC -o align_sw.so align_sw.c */
#include <stdlib.h>
#include <float.h>

static double sw1(const int *a, int n, const int *b, int m, const float *S, int D,
                  double go, double ge, int *ei, int *ej, double *H, double *E) {
  /* H,E: rows of length m+1 (work buffers) */
  double best = 0; int bi = -1, bj = -1;
  for (int j = 0; j <= m; j++) { H[j] = 0; E[j] = -1e18; }
  for (int i = 1; i <= n; i++) {
    const float *row = S + (size_t)a[i - 1] * D;
    double diag = 0; /* H[i-1][0] */
    double F = -1e18, Hleft = 0;
    for (int j = 1; j <= m; j++) {
      double up = H[j];
      double e = E[j] - ge; double t = up - go; if (t > e) e = t; E[j] = e;
      double f = F - ge; t = Hleft - go; if (t > f) f = t; F = f;
      double h = diag + row[b[j - 1]];
      if (e > h) h = e; if (f > h) h = f; if (h < 0) h = 0;
      diag = up; H[j] = h; Hleft = h;
      if (h > best) { best = h; bi = i; bj = j; }
    }
  }
  *ei = bi; *ej = bj; return best;
}

/* seqs concatenated in `all`, offsets/lens per sequence; pairs as (x,y) sequence indices */
void sw_batch(const int *all, const long *off, const int *len, const int *px, const int *py,
              long np, const float *S, int D, double go, double ge, double *out, int *oi, int *oj,
              int maxlen) {
  double *H = malloc(sizeof(double) * (maxlen + 2));
  double *E = malloc(sizeof(double) * (maxlen + 2));
  for (long k = 0; k < np; k++) {
    int x = px[k], y = py[k];
    out[k] = sw1(all + off[x], len[x], all + off[y], len[y], S, D, go, ge, oi + k, oj + k, H, E);
  }
  free(H); free(E);
}
