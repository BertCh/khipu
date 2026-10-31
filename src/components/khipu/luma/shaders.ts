/**
 * The cord shader. Every drawn piece of cord is one instanced *segment*:
 * two centerline samples with their frames, radii, arc lengths and colour.
 * A fixed template of ring vertices is extruded around it on the GPU, so
 * the CPU only ships centerlines each frame.
 *
 * The cross-section is a two-ply rope: a two-lobed profile that turns
 * along the cord with the recorded twist (S = left-handed, Z = right), so
 * the ridges lean `\` or `/` in the silhouette and in the shading, and a
 * barber-pole cord really is two plies of different colours.
 *
 * Colour is linear throughout: `hexRgb` (model.ts) decodes the recorded
 * sRGB colours once on the CPU, the lights and tints here are decoded in
 * the shader, and `finish` tone maps (Khronos PBR Neutral, which leaves
 * mid-tones and hues alone) and encodes back to sRGB for the default
 * framebuffer, which is not an sRGB target.
 */

export const SIDES = 22;
/** Thinnest drawn radius, in pixels (the vertex shader's MIN_PX; chunks.ts culls with it). */
export const MIN_PX = 0.7;
export const FLOATS_PER_INSTANCE = 42;
export const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/** Where each field sits inside an instance record (float offsets). */
export const F = {
	p0: 0,
	p1: 3,
	t0: 6,
	t1: 9,
	n0: 12,
	n1: 15,
	r0: 18,
	r1: 19,
	s0: 20,
	s1: 21,
	twist: 22,
	plied: 23,
	pattern: 24,
	feature: 25,
	color: 26,
	accent: 29,
	cordId: 32,
	shade: 33,
	/** per end: how far the section may reach toward the bend's centre, and that direction (cos, sin) round the frame */
	bend0: 34,
	bend1: 37,
	/** ply strength and shade at the far end (the near ones are `plied`, `shade`): knot↔body splices ease */
	plied1: 40,
	shade1: 41,
} as const;

/**
 * The cord vertex shader. Passes derived from it by string surgery (the
 * picking id pass, the shadow depth pass) rely on the anchors
 * `out vec3 vWorld;` and `vWorld = pos;` — keep both exactly.
 */
export const VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 corner;         // per-vertex template: (end 0|1, side index)
in vec3 p0;
in vec3 p1;
in vec3 t0;             // tangents at each sample, shared with the neighbours
in vec3 t1;
in vec3 n0;
in vec3 n1;
in vec4 radii;          // r0, r1, s0, s1
in vec4 flags;          // twist, plied, pattern, feature
in vec3 color;
in vec3 accent;
in vec2 ident;          // cordId, shade
in vec3 bend0;          // cap, cos psi, sin psi at each end (see Packer.addStream)
in vec3 bend1;
in vec2 ends;           // plied, shade at the far end (flags.y, ident.y are the near end's)
uniform mat4 uMVP;
uniform float uSides;
uniform float uDiameter;
uniform vec3 uEye;
uniform float uPxWorld; // world size of one pixel at unit distance; 0 = no minimum width
uniform vec2 uLod;      // this draw's band of on-screen radius [lo, hi), pixels (see CORD_LODS)
out vec3 vWorld;
out vec3 vNormal;       // normal of the round section (the ply relief is added per fragment)
out vec3 vLobeDir;      // direction round the surface in which the ply phase grows
out vec3 vFibreT;       // the fibres' direction on the surface
out vec3 vColor;
out vec3 vAccent;
out float vPattern;
out float vFeature;
out float vCordId;
out float vShade;
out float vPlyPhase;    // angle round the section relative to the ply lobes
out float vArc;         // arc length in diameters
out float vPlied;
out float vCoverage;    // share of the widened tube a sub-pixel cord really covers

const float TAU = 6.28318530718;
const float PLY_PITCH = 3.8;   // diameters per full turn of the plies
const float PLY_DEPTH = 0.18;  // silhouette bumps; the shading relief is per fragment
const float MIN_PX = ${MIN_PX.toFixed(3)};    // thinnest drawn radius, in pixels

void main(void) {
  // Whole-segment rejection, identical for every vertex of an instance (same
  // inputs, same maths), so a rejected segment collapses to one point and
  // its triangles are dropped before rasterisation. A segment is drawn by
  // the one level-of-detail draw whose band holds its on-screen radius, and
  // by none if its bounding sphere is outside the frustum.
  vec3 mid = 0.5 * (p0 + p1);
  float rMax = max(radii.x, radii.y);
  float dist = max(distance(uEye, mid), 1e-3);
  if (uPxWorld > 0.0) {
    float pxR = rMax / (uPxWorld * dist);
    if (pxR < uLod.x || pxR >= uLod.y) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
  }
  {
    // Clip planes are rows of the matrix: w ± x ≥ 0 etc. A sphere of radius R
    // is outside a plane when its centre is further than R·|plane.xyz| behind.
    // (widened for the ply lobes, the gauge and the minimum on-screen width)
    float R = 0.5 * distance(p0, p1) + 1.25 * max(rMax, MIN_PX * uPxWorld * dist);
    vec4 c = uMVP * vec4(mid, 1.0);
    vec3 rx = vec3(uMVP[0][0], uMVP[1][0], uMVP[2][0]);
    vec3 ry = vec3(uMVP[0][1], uMVP[1][1], uMVP[2][1]);
    vec3 rz = vec3(uMVP[0][2], uMVP[1][2], uMVP[2][2]);
    vec3 rw = vec3(uMVP[0][3], uMVP[1][3], uMVP[2][3]);
    if (c.w + c.x < -R * length(rw + rx) || c.w - c.x < -R * length(rw - rx) ||
        c.w + c.y < -R * length(rw + ry) || c.w - c.y < -R * length(rw - ry) ||
        c.w + c.z < -R * length(rw + rz)) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
  }
  float e = corner.x;
  float theta = corner.y / uSides * TAU;
  vec3 p = mix(p0, p1, e);
  vec3 t = normalize(mix(t0, t1, e));
  vec3 n = mix(n0, n1, e);
  n = normalize(n - t * dot(n, t));
  vec3 b = cross(t, n);
  float r = mix(radii.x, radii.y, e);
  float s = mix(radii.z, radii.w, e);
  float twist = flags.x;
  float plied = mix(flags.y, ends.x, e);
  vec3 bend = mix(bend0, bend1, e);
  // A cord thinner than a pixel breaks up into crawling dashes. Draw it at
  // least MIN_PX wide and let alpha-to-coverage take back the difference,
  // so a far cord fades out instead of flickering.
  float coverage = 1.0;
  if (uPxWorld > 0.0) {
    float px = r / (uPxWorld * max(distance(uEye, p), 1e-3));
    float grow = max(1.0, MIN_PX / max(px, 1e-4));
    r *= grow;
    bend.x *= grow;
    coverage = 1.0 / grow;
  }
  // the two-lobed section turns with the ply: S leans back, Z forward
  float phi = -twist * TAU * s / PLY_PITCH;
  float lobe = theta - phi;
  float amp = PLY_DEPTH * plied;
#ifdef SHADOW_PASS
  // a slightly thinner, round caster: the receiving surface stays in front
  amp = 0.0;
  r *= 0.92;
#endif
  // Hand-made cord is not perfectly gauged. Two low-amplitude, incommensurate
  // waves break the machined-tube silhouette without making the yarn lumpy.
  float gauge = 1.0 + 0.014 * sin(s * 2.17 + ident.x * 1.31)
                    + 0.008 * sin(s * 5.73 + theta * 3.0);
  float rho = (1.0 + amp * cos(2.0 * lobe)) * gauge;
  vec3 N = n * cos(theta) + b * sin(theta);
  vec3 Nt = -n * sin(theta) + b * cos(theta);
  float reach = r * rho;
  float dphi = -twist * TAU / PLY_PITCH / uDiameter;   // per world unit
  vec3 normal = N;
  // Where the centerline bends tighter than the cord is thick, the section
  // on the inside of the bend would pass through the hinge between this
  // segment and the next and turn the tube inside out. The swept solid's
  // real boundary there is flat: the section is cut off at the hinge, the
  // way a cord flattens on the inside of a sharp bend.
  if (bend.x > 0.0) {
    float toward = cos(theta) * bend.y + sin(theta) * bend.z;
    if (toward > 0.0 && reach * toward > bend.x) {
      reach = bend.x / toward;
      normal = n * bend.y + b * bend.z;
    }
  }
  vec3 pos = p + N * reach;
  vWorld = pos;
  vNormal = normal;
  // lines of equal ply phase run along t + r·dphi·Nt; the phase grows across them
  vLobeDir = Nt - (r * dphi) * t;
  // fibres spun into a ply lie close to the cord axis, leaning a little with it
  vFibreT = normalize(t + 0.2 * (r * dphi) * Nt);
  vColor = color;
  vAccent = accent;
  vPattern = flags.z;
  vFeature = flags.w;
  vCordId = ident.x;
  vShade = mix(ident.y, ends.y, e);
  vPlyPhase = lobe;
  vArc = s;
  vPlied = plied;
  vCoverage = coverage;
  gl_Position = uMVP * vec4(pos, 1.0);
}`;

/** The cord vertex shader for the shadow map: round, a touch thin (drawn with SHADOW_SIDES). */
export const SHADOW_VS = VS.replace(
	"#version 300 es",
	"#version 300 es\n#define SHADOW_PASS",
);

/** Depth only; the colour is never stored. */
export const SHADOW_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
void main(void) {
  fragColor = vec4(1.0);
}`;

/**
 * Shared by the cord and backdrop fragment shaders: noise, the colour
 * transfer functions, the key light's shadow and the final tone map.
 */
const COMMON = /* glsl */ `
const float PI = 3.14159265359;
/** Scene-referred scale under the Light slider: its default (1.08) puts a white cord's lit side near 0.85. */
const float EXPOSURE = 0.9;
const vec3 KEY = vec3(1.0, 0.96, 0.90);       // white-balanced, a little warm
const vec3 FILL = vec3(0.80, 0.88, 1.0);      // cool bounce from the room
const vec3 SKY = vec3(0.88, 0.92, 1.0);
const vec3 GROUND = vec3(0.50, 0.46, 0.42);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/** 1 while a feature of this many cycles per pixel is resolved, 0 once it would alias. */
float resolved(float cyclesPerPx) {
  return 1.0 - smoothstep(0.25, 0.5, cyclesPerPx);
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

/** Khronos PBR Neutral: identity below 0.76, hue-preserving roll-off above. */
vec3 neutralToneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

/** Tone map, encode for the (non-sRGB) canvas, and dither away the 8-bit banding. */
vec4 finish(vec3 linear, float alpha) {
  vec3 c = linearToSrgb(clamp(neutralToneMap(max(linear, 0.0)), 0.0, 1.0));
  c += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  return vec4(c, alpha);
}

/**
 * The key light's visibility: 3×3 hardware-filtered PCF taps 1.5 texels
 * apart. The receiver is pushed out along its normal first, which is what
 * keeps a thin round cord from shadowing itself in stripes.
 */
float keyShadow(vec3 world, vec3 normal) {
  vec4 c = uLightMVP * vec4(world + normal * 0.015, 1.0);
  vec3 q = c.xyz / c.w * 0.5 + 0.5;
  if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
  float stride = 1.5 * uShadowTexel;
  float sum = 0.0;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++)
      sum += texture(uShadowMap, vec3(q.xy + vec2(float(i), float(j)) * stride, q.z));
  return sum / 9.0;
}
`;

const FS_UNIFORMS = /* glsl */ `
uniform vec3 uEye;
uniform float uExposure;
uniform vec3 uLightDir;      // toward the key light
uniform mat4 uLightMVP;
uniform float uShadowTexel;  // 1 / shadow map size
uniform highp sampler2DShadow uShadowMap;
`;

export const FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLobeDir;
in vec3 vFibreT;
in vec3 vColor;
in vec3 vAccent;
in float vPattern;
in float vFeature;
in float vCordId;
in float vShade;
in float vPlyPhase;
in float vArc;
in float vPlied;
in float vCoverage;
${FS_UNIFORMS}
uniform float uViewMode;
uniform float uSelected;
uniform float uHover;
out vec4 fragColor;
${COMMON}

vec3 knotTint(float f) {
  if (f > 0.5 && f < 1.5) return vec3(0.98, 0.42, 0.18);   // single
  if (f > 1.5 && f < 2.5) return vec3(0.86, 0.68, 0.30);   // long
  if (f > 2.5 && f < 3.5) return vec3(0.90, 0.92, 0.88);   // figure-eight
  if (f > 3.5 && f < 4.5) return vec3(0.62, 0.55, 0.85);   // other knot
  if (f > 9.5 && f < 10.5) return vec3(0.55, 0.62, 0.60);  // stopper / end knot
  return vec3(0.20, 0.23, 0.23);
}
vec3 attachTint(float f) {
  if (f > 4.5 && f < 5.5) return vec3(0.25, 0.78, 0.72);   // recto
  if (f > 5.5 && f < 6.5) return vec3(0.98, 0.55, 0.20);   // verso
  if (f > 6.5 && f < 7.5) return vec3(0.62, 0.62, 0.60);   // other / unknown
  if (f > 7.5 && f < 8.5) return vec3(0.75, 0.62, 0.85);   // cord end
  return vec3(0.20, 0.23, 0.23);
}

void main(void) {
  vec3 Nr = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  // Where across a ply this fragment is. The profile's ridges sit at
  // lobe = 0, π and its grooves at ±π/2, so w is 0|1 in a groove and 0.5
  // on a crown, and the ply is which of the two lobes the fragment is on.
  float w = fract(vPlyPhase / PI + 0.5);
  float u = 2.0 * w - 1.0;
  float h = sqrt(max(1.0 - u * u, 0.0));        // height over a round ply's section
  float plyC = cos(vPlyPhase);                  // > 0 on ply A, < 0 on ply B
  float plyB = clamp(0.5 - plyC / (2.0 * fwidth(plyC) + 1e-4), 0.0, 1.0);

  // How big the detail is on screen: a ply spans π of phase, a diameter 1 of arc.
  float phasePx = fwidth(vPlyPhase);
  float arcPx = fwidth(vArc);
  float relief = vPlied * resolved(phasePx / PI * 1.2);     // plies ≥ ~5 px
  vec3 G = vLobeDir - Nr * dot(vLobeDir, Nr);
  G *= inversesqrt(max(dot(G, G), 1e-8));
  // Each ply is round: its surface tilts back toward the groove on either side.
  float slope = clamp(u / max(h, 0.25), -4.0, 4.0);
  vec3 N = Nr + 0.55 * relief * slope * G;
  // fibre relief: fine lengthwise ridges tied to the surface, not the view
  float fibreFade = resolved(phasePx * 2.0) * resolved(arcPx * 0.6);
  // (each noise is skipped where it has faded out: far cords are most of the fragments)
  if (fibreFade * vPlied > 0.0) {
    float fibre = noise(vec2(vPlyPhase * 12.0, vArc * 1.6 + vCordId * 7.1)) - 0.5;
    N += 0.22 * vPlied * fibreFade * fibre * G;
  }
  N = normalize(N);

  vec3 base = vColor;
  if (vPattern > 0.5 && vPattern < 1.5) {
    // barber pole: one ply of each colour
    base = mix(vColor, vAccent, plyB);
  } else if (vPattern > 1.5 && vPattern < 2.5) {
    // Mottled: fibres of both colours spun together, a heather. Streaks run
    // along the fibres (long in arc, fine across the ply: a few to a ply)
    // with soft edges, and the share of the second colour drifts slowly
    // down the cord, as a spinner's hands do.
    vec2 q = vec2(vPlyPhase * 8.0 + vArc * 0.6, vArc * 1.3 + vCordId * 3.7);
    float m = noise(q) * 0.55 + noise(q * vec2(2.3, 3.1) + 11.0) * 0.45;
    float share = 0.5 + 0.15 * sin(vArc * 0.21 + vCordId * 1.7);
    float fw = fwidth(m) + 0.1;
    // held a third of the way to the average mix: a heather, not a zebra
    float streak = mix(1.0 - share, smoothstep(share - fw, share + fw, m), 0.7);
    float fade = resolved(max(phasePx * 8.0 * 2.3, arcPx * 1.3 * 3.1) * 0.5);
    base = mix(vColor, vAccent, mix(1.0 - share, streak, fade));
  } else if (vPattern > 2.5 && vPattern < 3.5) {
    // striped: a band of the second colour runs down the middle of one ply
    float fw = fwidth(u) + 1e-3;
    float band = plyB * (1.0 - smoothstep(0.45 - fw, 0.45 + fw, abs(u)));
    float fade = resolved(phasePx * 4.0 / PI);
    base = mix(vColor, vAccent, mix(0.45 * 0.5, band, fade));
  } else if (vPattern > 3.5) {
    // tweed: sparse short flecks of the second colour
    vec2 q = vec2(vPlyPhase * 3.0, vArc * 2.0 + vCordId * 5.3);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float on = step(0.86, hash21(cell));
    float fleck = on * (1.0 - smoothstep(0.18, 0.3, length(f * vec2(1.0, 0.45))));
    float fade = resolved(max(phasePx * 3.0, arcPx * 2.0) * 2.0);
    base = mix(vColor, vAccent, mix(0.055, fleck, fade));
  }
  // Irregular, low-contrast fibre scale variation, averaged away once it
  // would be finer than a couple of pixels.
  float hair = 0.5;
  float hairFade = resolved(arcPx * 37.0);
  if (hairFade > 0.0) hair = mix(0.5, noise(vec2(vArc * 37.0, vPlyPhase * 3.7)), hairFade);
  float nap = 0.5;
  float napFade = resolved(arcPx * 9.0);
  if (napFade > 0.0) nap = mix(0.5, noise(vec2(vArc * 9.0 + 17.0, vPlyPhase * 8.0)), napFade);
  base *= 0.90 + 0.11 * hair + 0.035 * nap;
  base *= vShade;

  if (uViewMode > 0.5 && uViewMode < 1.5) base = srgbToLinear(knotTint(vFeature));
  else if (uViewMode > 1.5) base = srgbToLinear(attachTint(vFeature));

  // Matte camelid/cotton fibre: a shadowed key with a little wrap, a cool
  // fill, a sky/floor ambient, and the grooves between plies occluded.
  vec3 L = uLightDir;
  float NdotL = dot(N, L);
  float wrap = 0.25;
  float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);
  float shadow = keyShadow(vWorld, Nr);
  const vec3 Fd = vec3(0.8872, 0.1232, 0.4436);     // toward the fill, normalised
  float fill = clamp(dot(N, Fd) * 0.5 + 0.5, 0.0, 1.0);
  vec3 ambient = mix(GROUND, SKY, N.y * 0.5 + 0.5);
  float groove = (1.0 - h) * (1.0 - h);
  float cavity = 1.0 - 0.5 * vPlied * mix(0.12, groove, relief / max(vPlied, 1e-3));
  vec3 lit = base * (KEY * diffuse * shadow + FILL * fill * 0.3 + ambient * 0.2) * cavity;

  // Kajiya–Kay highlight along the fibres, widened where the normal changes
  // faster than a pixel can hold (Tokuyoshi–Kaplanyan) so it cannot sparkle.
  vec3 H = normalize(L + V);
  vec3 dx = dFdx(N);
  vec3 dy = dFdy(N);
  float variance = 0.25 * (dot(dx, dx) + dot(dy, dy));
  float a2 = min(0.045 + min(2.0 * variance, 0.18), 1.0);
  float expo = 2.0 / a2 - 2.0;
  float TdotH = dot(vFibreT, H);
  // sin(T,H)^e written as (1 − cos²)^(e/2): one pow, no sqrt
  float kk = pow(max(1.0 - TdotH * TdotH, 1e-4), 0.5 * expo) * sqrt(expo * (1.0 / 42.0));
  lit += KEY * (kk * 0.07 * shadow * smoothstep(-0.1, 0.35, NdotL) * cavity);
  // soft sheen of loose fibres at grazing angles
  float NdotV = max(dot(N, V), 0.0);
  float grazing = (1.0 - NdotV) * (1.0 - NdotV);
  float sheen = grazing * grazing;
  lit += base * sheen * 0.35 * (KEY * diffuse * shadow + ambient * 0.3);

  // Selection keeps the chosen cord's own colour and outlines it with a
  // neutral rim; everything else steps back, dimmer and greyer.
  // The rim is narrow (a cylinder's grazing band is wide) and never more
  // than a light edge, so a dark cord keeps its own colour.
  float edge = 1.0 - max(dot(Nr, V), 0.0);
  float edge2 = edge * edge;
  float rimV = edge2 * edge2 * edge;
  vec3 RIM = vec3(0.85, 0.88, 0.92);
  if (uSelected >= 0.0) {
    if (abs(vCordId - uSelected) < 0.5) lit += RIM * rimV * 0.3;
    else {
      float Y = dot(lit, vec3(0.2126, 0.7152, 0.0722));
      lit = mix(lit, vec3(Y), 0.6) * 0.45;
    }
  }
  if (uHover >= 0.0 && abs(vCordId - uHover) < 0.5) lit += RIM * rimV * 0.12;

  fragColor = finish(lit * uExposure * EXPOSURE, vCoverage);
}`;

/** The backdrop: a vertical board behind the khipu, in world x, y. */
export const BOARD_VS = /* glsl */ `#version 300 es
precision highp float;
in vec2 position;
uniform mat4 uMVP;
uniform float uBoardZ;
out vec3 vWorld;
void main(void) {
  vWorld = vec3(position, uBoardZ);
  gl_Position = uMVP * vec4(vWorld, 1.0);
}`;

/**
 * A dark, neutral linen board the khipu hangs in front of, as in a museum
 * case: plain-weave threads (averaged out once they are sub-pixel), slubs
 * and a slow mottle, the key light's shadow of the cords, and a soft pool
 * of light that fades to the background colour at the edges.
 */
export const BOARD_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
${FS_UNIFORMS}
uniform vec3 uBackground;    // linear; what the pool of light fades to
uniform vec2 uPoolCentre;
uniform float uPoolRadius;
out vec4 fragColor;
${COMMON}

const vec3 LINEN = vec3(0.070, 0.072, 0.078);

void main(void) {
  vec2 q = vWorld.xy * 55.0;                 // threads per unit (1 unit = 4 cm)
  vec2 fq = fwidth(q);
  float fade = resolved(max(fq.x, fq.y));
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float over = mod(cell.x + cell.y, 2.0);
  float thread = mix(1.0 - 4.0 * f.x * f.x, 1.0 - 4.0 * f.y * f.y, over);
  float slub = mix(noise(vec2(cell.x * 0.9, q.y * 0.06)), noise(vec2(q.x * 0.06, cell.y * 0.9)), over);
  float weave = mix(1.0, 0.84 + 0.2 * thread + 0.14 * (slub - 0.5), fade);
  float mottle = 0.94 + 0.12 * noise(vWorld.xy * 2.3) * resolved(max(fq.x, fq.y) / 55.0 * 2.3);
  vec3 albedo = LINEN * weave * mottle;

  float shadow = mix(1.0, keyShadow(vWorld, vec3(0.0, 0.0, 1.0)), 0.65);
  vec3 lit = albedo * (KEY * max(uLightDir.z, 0.0) * shadow + SKY * 0.18);
  vec3 toned = neutralToneMap(lit * uExposure * EXPOSURE);
  float d = length(vWorld.xy - uPoolCentre) / uPoolRadius;
  float pool = exp(-d * d * 0.9);
  vec3 c = linearToSrgb(clamp(mix(uBackground, toned, pool), 0.0, 1.0));
  c += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}`;
