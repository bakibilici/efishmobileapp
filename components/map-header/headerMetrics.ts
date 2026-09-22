/**
 * The map header's grid: one column, one set of margins, a deliberate
 * rhythm. Every row runs from SIDE to SIDE, so the search field, the tier
 * chips and the status capsule read as one group of controls instead of
 * three shapes floating over the map at three different widths.
 *
 * Pure (no imports), so scripts/check-map-header.ts runs it under tsx. The
 * collapse animation derives its offsets from these numbers, and a check
 * asserts they still agree.
 */

/** The header's top: 8 under the safe area, the route sheet's floating button's anchor. */
export const ANCHOR_GAP = 8;
/** The side margins every row shares. */
export const SIDE = 16;
/** The search field's height. */
export const FIELD_H = 48;
/** The chip's glass shape. */
export const CHIP_H = 36;
/** The chip's touch row: 44 pt around a 36 pt shape, so 4 pt of slack each side. */
export const CHIP_TOUCH = 44;
export const CHIP_SLACK = (CHIP_TOUCH - CHIP_H) / 2;
/** The status capsule's height. */
export const CAPSULE_H = 44;
/** Search field → chips. One job, "bul ve süz", so they sit close. */
export const GAP_TIGHT = 8;
/** Chips → status capsule. A different subject, "sen", so it gets more air. */
export const GAP_GROUP = 12;

/**
 * The margins that produce those gaps. The chips' touch row already carries
 * CHIP_SLACK above and below the glass, so each margin is the gap less that.
 */
export const CHIPS_MARGIN = GAP_TIGHT - CHIP_SLACK;
export const STATUS_MARGIN = GAP_GROUP - CHIP_SLACK;

/** Before the first layout: the search row and the chips' touch row. */
export const CONTROLS_FALLBACK = FIELD_H + CHIPS_MARGIN + CHIP_TOUCH;
/** Before the first layout: the whole header, expanded. */
export const GROUP_FALLBACK = CONTROLS_FALLBACK + STATUS_MARGIN + CAPSULE_H;

/**
 * How far the status capsule travels to land on the anchor when the header
 * collapses: the controls' measured height plus the margin under them. The
 * capsule's width does not change on the way, so the shape only moves.
 */
export const statusCollapseOffset = (controlsHeight: number) =>
  -(controlsHeight + STATUS_MARGIN);

/* The band behind the header (HeaderBackdrop) ----------------------------- */

/** Air under the header's last row before the band begins to fade. */
export const BAND_PAD = 6;
/** The falloff: how far past that the blur and the wash reach nothing. */
export const BAND_FADE = 48;
/**
 * Band drawn above the screen's top edge. The band shrinks by moving up —
 * a transform, because a blur whose height animates re-lays out every frame
 * — so it carries spare height for the longest collapse travel; without it,
 * a collapse would uncover the status bar.
 */
export const BAND_OVERSCAN = 160;

/**
 * The band's solid part: the screen's top down to just under the header's
 * last row. The same sum the rows themselves produce, so the band's bottom
 * keeps its distance from the capsule whatever the rows measure.
 */
export const bandSolidHeight = (
  safeTop: number,
  controlsHeight: number,
  statusHeight: number,
) => safeTop + ANCHOR_GAP + controlsHeight + STATUS_MARGIN + statusHeight + BAND_PAD;

/** The band, fade included. */
export const bandHeight = (safeTop: number, controlsHeight: number, statusHeight: number) =>
  bandSolidHeight(safeTop, controlsHeight, statusHeight) + BAND_FADE;

/** The blur over the solid part, where every layer of the stack overlaps. */
export const BAND_BLUR = 48;
/** The steps the falloff is cut into. Each one costs a blur view. */
export const BAND_STEPS = 6;

/**
 * The progressive blur, approximated. There is no masked view in this app,
 * so the falloff is stacked instead: each layer covers the solid part and
 * reaches a fraction of the fade below it, so the blur is strongest where
 * all of them overlap and one step weaker under every layer that has ended.
 *
 * Which intensity goes on which layer is the whole trick. Blurs compose in
 * quadrature — two of radius r read as one of r√2 — so equal layers would
 * fall off in √k steps: nearly nothing at the top and a cliff at the last
 * one, exactly where the edge must not show. Handing layer k the intensity
 * √(2k−1) × BAND_BLUR/BAND_STEPS makes the sum reach BAND_BLUR in equal
 * steps instead, so every edge in the fade is the same small drop, and the
 * one at the very bottom is the smallest blur of the stack under a wash
 * that has already reached zero.
 */
export const BAND_LAYERS = Array.from({ length: BAND_STEPS }, (_, index) => {
  // 1 is the deepest layer: it reaches the band's bottom edge and is the faintest.
  const step = index + 1;
  return {
    reach: (BAND_STEPS - index) / BAND_STEPS,
    intensity: Math.round((BAND_BLUR / BAND_STEPS) * Math.sqrt(2 * step - 1)),
  };
});

/** What the stack reads as where it all overlaps: blurs add in quadrature. */
export const bandBlurAt = (layers: readonly { intensity: number }[]) =>
  Math.sqrt(layers.reduce((sum, layer) => sum + layer.intensity ** 2, 0));
