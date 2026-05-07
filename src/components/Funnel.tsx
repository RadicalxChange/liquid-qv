import { motion, useReducedMotion } from 'framer-motion';
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef } from 'react';

/*
 * Funnel — a 90°-apex V-trough rendered in 3/4 perspective. The form is
 * a triangular prism standing vertically on its apex, viewed from a
 * camera offset slightly to the right and slightly above (~18° yaw,
 * ~9° pitch). The user reads it as a vessel — rim, walls, depth, water
 * surface — without us changing what the math is doing.
 *
 * Why a prism, not a cone
 * -----------------------
 * A cone's volume scales with h³ → cubic voting. A triangular prism
 * (V cross-section extruded perpendicular to the screen by a constant
 * depth D) keeps volume proportional to h² × D. With the math layer
 * treating D as 1, this preserves the QV identity:
 *
 *     credits = votes²
 *
 * exactly. The 3D appearance is a rendering decision; the conservation
 * math is unchanged.
 *
 * Projection
 * ----------
 * Parallel projection (no vanishing points). Points at depth z=0 sit
 * at their natural (x, y); points at depth z=D shift LEFT and UP in
 * screen by (D·PROJECT_DX, D·PROJECT_DY). DX > 0 ⇒ back-of-trough
 * peeks out to the LEFT of the front face, exposing the right side
 * panel. DY > 0 ⇒ rim and water surface read as parallelograms.
 *
 *     screen_x = x − z · DX
 *     screen_y = y − z · DY
 *
 * Z-order, back to front
 * ----------------------
 *   1. Drop shadow + base footing
 *   2. Back face V triangle (faint, peeks above the rim)
 *   3. Water body — V at level h, drawn behind the front wall
 *   4. Water surface parallelogram at level h (top of the liquid plane)
 *   5. Right side panel (translucent gray; partly occludes water on
 *      the right)
 *   6. Front face V (translucent; water visible through it)
 *   7. Top rim band (outer rim minus inner rim ⇒ visible wall thickness)
 *   8. Outline strokes for the trough silhouette
 *
 * Interaction, animation, ARIA, prop interface — all unchanged from the
 * 2D version. Only the SVG rendering changed.
 */

interface FunnelProps {
  /** Real-valued vote level (rest or live). */
  votes: number;
  /** Maximum allowed votes here (= √budget). */
  maxVotes: number;
  /** Visible label for screen readers and the slider's aria-valuetext. */
  label: string;
  /** Begin a continuous pour (Space/Enter held). */
  onPourStart: (direction: 'in' | 'out') => void;
  /** End a continuous pour (Space/Enter released). */
  onPourEnd: () => void;
  /**
   * Disable the water polygon's interpolation animation. Set during an
   * active hold so the water tracks the live value frame-for-frame
   * instead of lagging behind a moving Framer-Motion target.
   */
  instantUpdate?: boolean;
  /** Pixel width of the funnel SVG. The trough's height auto-derives. */
  size?: number;
  /** Override CSS custom properties on the wrapper. */
  style?: CSSProperties;
}

/** One-decimal rounding for both visible readouts and ARIA values. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

// 3/4-perspective constants. Tuned by feel:
// - DX = sin(~18°) so the right side panel reads clearly.
// - DY = sin(~9°) so the rim shows as a clear parallelogram, not a line.
const PROJECT_DX = 0.31;
const PROJECT_DY = 0.16;
// Trough depth as fraction of front-face full width. Big enough that
// the side panel reads, small enough that the trough still feels
// "bowl-on-its-apex" rather than a long log.
const TROUGH_DEPTH_FRACTION = 0.28;
// Wall thickness as fraction of the trough's V height. Visible at the
// rim; doesn't impose itself on the silhouette.
const WALL_THICKNESS_FRACTION = 0.045;

/** Project a 3D point (x, y, z) — z=0 front, z=D back — to screen. */
const project = (x: number, y: number, z: number) => ({
  sx: x - z * PROJECT_DX,
  sy: y - z * PROJECT_DY,
});

const pathTri = (
  a: { sx: number; sy: number },
  b: { sx: number; sy: number },
  c: { sx: number; sy: number },
): string => `M ${a.sx} ${a.sy} L ${b.sx} ${b.sy} L ${c.sx} ${c.sy} Z`;

const pathQuad = (
  a: { sx: number; sy: number },
  b: { sx: number; sy: number },
  c: { sx: number; sy: number },
  d: { sx: number; sy: number },
): string => `M ${a.sx} ${a.sy} L ${b.sx} ${b.sy} L ${c.sx} ${c.sy} L ${d.sx} ${d.sy} Z`;

export const Funnel = ({
  votes,
  maxVotes,
  label,
  onPourStart,
  onPourEnd,
  instantUpdate = false,
  size = 220,
  style,
}: FunnelProps) => {
  const reduceMotion = useReducedMotion();
  const sliderId = useId();
  const holdKeyRef = useRef<string | null>(null);

  // ------------------------------------------------------------
  // Layout — viewBox grows just enough to fit the back projection.
  // ------------------------------------------------------------
  const PAD_TOP_BASE = 14;
  const PAD_LEFT_BASE = 14;
  const PAD_RIGHT_BASE = 14;
  const PAD_BOTTOM_BASE = 22; // a little extra room for the base footing
  const frontWidth = size - PAD_LEFT_BASE - PAD_RIGHT_BASE;
  const usableHeight = frontWidth / 2; // 45° walls ⇒ height = width / 2
  const D = frontWidth * TROUGH_DEPTH_FRACTION;
  // Back projects up-and-LEFT; widen the viewBox on the left and top.
  const extraLeft = D * PROJECT_DX;
  const extraTop = D * PROJECT_DY;
  const PAD_LEFT = PAD_LEFT_BASE + extraLeft;
  const PAD_TOP = PAD_TOP_BASE + extraTop;
  const viewBoxW = size + extraLeft;
  const viewBoxH = PAD_TOP + usableHeight + PAD_BOTTOM_BASE;
  const cx = PAD_LEFT + frontWidth / 2;
  const apexY = PAD_TOP + usableHeight;
  const SCALE = maxVotes > 0 ? usableHeight / maxVotes : 1;

  const wt = usableHeight * WALL_THICKNESS_FRACTION;

  // ------------------------------------------------------------
  // Trough vertices — outer (silhouette) and inner (rim hole).
  // ------------------------------------------------------------
  // Outer V vertices.
  const fApex = project(cx, apexY, 0);
  const fTL = project(cx - usableHeight, apexY - usableHeight, 0);
  const fTR = project(cx + usableHeight, apexY - usableHeight, 0);
  const bApex = project(cx, apexY, D);
  const bTL = project(cx - usableHeight, apexY - usableHeight, D);
  const bTR = project(cx + usableHeight, apexY - usableHeight, D);

  // Inner rim — the *opening* in the top of the trough, used to draw
  // the wall thickness band. For 45° walls a uniform `wt` perpendicular
  // shrinks the top of the V by `wt` horizontally and lowers the rim
  // by `wt`. We don't need the inner apex (the rim band is just the
  // top parallelogram); the inner V's full silhouette stays implicit.
  const innerHTL = cx - usableHeight + wt;
  const innerHTR = cx + usableHeight - wt;
  const innerTopY = apexY - usableHeight + wt;
  const iFTL = project(innerHTL, innerTopY, 0);
  const iFTR = project(innerHTR, innerTopY, 0);
  const iBTL = project(innerHTL, innerTopY, D);
  const iBTR = project(innerHTR, innerTopY, D);

  // ------------------------------------------------------------
  // Water — front-face V at level h, plus a surface parallelogram.
  // The water body lives "inside" the trough; the wall layers above
  // partly occlude it, which is what gives the vessel its depth read.
  // ------------------------------------------------------------
  const h = Math.max(0, Math.min(votes, maxVotes)) * SCALE;
  const wFTL = project(cx - h, apexY - h, 0);
  const wFTR = project(cx + h, apexY - h, 0);
  const wBTL = project(cx - h, apexY - h, D);
  const wBTR = project(cx + h, apexY - h, D);
  // Water body always emits a valid degenerate path at h=0 (collapses
  // to a single point) so Framer Motion can interpolate without
  // warnings.
  const waterBodyPath = pathTri(fApex, wFTL, wFTR);
  const waterSurfacePath = pathQuad(wFTL, wFTR, wBTR, wBTL);
  // A subtle highlight along the front edge of the surface, so the
  // liquid plane reads as a top, not just a polygon.
  const waterSurfaceHighlightPath = `M ${wFTL.sx} ${wFTL.sy} L ${wFTR.sx} ${wFTR.sy}`;

  // ------------------------------------------------------------
  // Static trough paths.
  // ------------------------------------------------------------
  const backFacePath = pathTri(bApex, bTL, bTR);
  const rightFacePath = pathQuad(fApex, fTR, bTR, bApex);
  const frontFacePath = pathTri(fApex, fTL, fTR);
  const outerRimPath = pathQuad(fTL, fTR, bTR, bTL);
  const innerRimPath = pathQuad(iFTL, iFTR, iBTR, iBTL);
  const rimBandPath = `${outerRimPath} ${innerRimPath}`;

  // Base footing — a small flattened ellipse just below the apex, plus
  // a softer drop shadow under it. Subtle: just enough to ground.
  const baseY = apexY + 6;
  const baseRX = usableHeight * 0.20;
  const baseRY = usableHeight * 0.045;

  // ------------------------------------------------------------
  // Keyboard — Space / Enter (with optional Shift) drive the same
  // continuous pour as the +/− pointer holds. No tap shortcuts.
  // ------------------------------------------------------------
  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      if (e.repeat || holdKeyRef.current) return;
      e.preventDefault();
      holdKeyRef.current = e.key;
      onPourStart(e.shiftKey ? 'out' : 'in');
    }
  };
  const handleKeyUp = (e: KeyboardEvent<SVGSVGElement>) => {
    if (holdKeyRef.current && e.key === holdKeyRef.current) {
      holdKeyRef.current = null;
      onPourEnd();
    }
  };
  useEffect(() => {
    const cancel = () => {
      if (!holdKeyRef.current) return;
      holdKeyRef.current = null;
      onPourEnd();
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [onPourEnd]);

  const announcedVotes = round1(votes);
  const announcedCredits = round1(votes * votes);

  // Per-instance filter / gradient ids so multiple Funnels on the page
  // don't collide.
  const shadowId = `lqv-shadow-${sliderId}`;
  const sideGradientId = `lqv-side-${sliderId}`;
  const surfaceGradientId = `lqv-surface-${sliderId}`;

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={round1(maxVotes)}
      aria-valuenow={announcedVotes}
      aria-valuetext={`${announcedVotes.toFixed(1)} votes, ${announcedCredits.toFixed(1)} credits`}
      aria-orientation="vertical"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      style={{ userSelect: 'none', overflow: 'visible', ...style }}
      className="block"
      data-funnel-id={sliderId}
    >
      <defs>
        {/* Soft drop shadow — Gaussian blur of a dark ellipse below the apex. */}
        <filter id={shadowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        {/* Right side panel — slightly darker top-to-bottom to suggest depth. */}
        <linearGradient id={sideGradientId} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="var(--lqv-funnel-wall)" stopOpacity="0.40" />
          <stop offset="100%" stopColor="var(--lqv-funnel-wall)" stopOpacity="0.22" />
        </linearGradient>
        {/* Water surface — bright at the front edge, fading toward the back. */}
        <linearGradient id={surfaceGradientId} x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0%" stopColor="var(--lqv-water)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--lqv-water-dark)" stopOpacity="0.70" />
        </linearGradient>
      </defs>

      {/* Drop shadow under the base, then the base disc itself. */}
      <ellipse
        cx={cx}
        cy={baseY + baseRY * 1.2}
        rx={baseRX * 1.35}
        ry={baseRY * 1.5}
        fill="rgba(0, 0, 0, 0.28)"
        filter={`url(#${shadowId})`}
      />
      <ellipse
        cx={cx}
        cy={baseY}
        rx={baseRX}
        ry={baseRY}
        fill="var(--lqv-funnel-wall)"
        fillOpacity={0.45}
      />

      {/* Back face V — drawn first, peeks above the front rim from this angle. */}
      <path
        d={backFacePath}
        fill="var(--lqv-funnel-wall)"
        fillOpacity={0.10}
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1}
        strokeOpacity={0.45}
      />

      {/* Water body — V at the current display level. The instant-update
          path skips Framer Motion so the rAF-driven `votes` prop renders
          frame-for-frame during a live hold; outside a hold, the motion
          transition gives released-pour changes a soft settle. */}
      {instantUpdate || reduceMotion ? (
        <path
          d={waterBodyPath}
          fill="var(--lqv-water)"
          fillOpacity={0.88}
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <motion.path
          d={waterBodyPath}
          initial={false}
          fill="var(--lqv-water)"
          fillOpacity={0.88}
          animate={{ d: waterBodyPath }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Water surface — top plane of the liquid, visible from above
          (through the open rim) and faintly through the translucent
          front wall. */}
      {instantUpdate || reduceMotion ? (
        <path
          d={waterSurfacePath}
          fill={`url(#${surfaceGradientId})`}
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <motion.path
          d={waterSurfacePath}
          initial={false}
          fill={`url(#${surfaceGradientId})`}
          animate={{ d: waterSurfacePath }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Surface gloss — a thin lighter line along the front edge of
          the surface, so the plane reads as liquid not just polygon. */}
      {h > 0 &&
        (instantUpdate || reduceMotion ? (
          <path
            d={waterSurfaceHighlightPath}
            stroke="rgba(255, 255, 255, 0.55)"
            strokeWidth={1.2}
            fill="none"
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <motion.path
            d={waterSurfaceHighlightPath}
            initial={false}
            stroke="rgba(255, 255, 255, 0.55)"
            strokeWidth={1.2}
            fill="none"
            animate={{ d: waterSurfaceHighlightPath }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: 'none' }}
          />
        ))}

      {/* Right side panel — translucent gray, slightly darker than the
          front face. Partially occludes water on the right, which is
          part of how the vessel reads as 3D. */}
      <path d={rightFacePath} fill={`url(#${sideGradientId})`} />
      <path
        d={rightFacePath}
        fill="none"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1.2}
        strokeOpacity={0.7}
      />

      {/* Front face — most translucent layer, water visible through it. */}
      <path
        d={frontFacePath}
        fill="var(--lqv-funnel-wall)"
        fillOpacity={0.12}
      />
      <path
        d={frontFacePath}
        fill="none"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1.4}
        strokeOpacity={0.85}
        strokeLinejoin="round"
      />

      {/* Top rim band — outer minus inner via even-odd fill. The visible
          band is the wall material seen from above; one of the strongest
          "vessel" cues. */}
      <path
        d={rimBandPath}
        fill="var(--lqv-funnel-wall)"
        fillOpacity={0.55}
        fillRule="evenodd"
      />
      <path
        d={outerRimPath}
        fill="none"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1.2}
        strokeOpacity={0.85}
        strokeLinejoin="round"
      />
      <path
        d={innerRimPath}
        fill="none"
        stroke="var(--lqv-funnel-wall)"
        strokeWidth={1}
        strokeOpacity={0.55}
        strokeLinejoin="round"
      />
    </svg>
  );
};
