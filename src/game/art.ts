// Yeti Run pixel art — the slope, its furniture, the yeti, and the skier.
// Every sprite is a list of [x, y, w, h, color, opacity?] rects in art pixels;
// src/game/render.ts records each one into a Skia picture once and stamps it.
// Ported from rungotchu (the skier is new).
//
// The palette is Winter Grit's: navy night, frost-blue light, red/blue for the
// slalom flags. The snow is lit by a
// moon at the upper left, so every object shades light on its left and casts
// a short shadow down-right.

/** One rect of pixel art: x, y, width, height, color, optional opacity. */
export type Px = [number, number, number, number, string, number?];

export const WOOD = "#7f5539";
export const WOOD_LIGHT = "#9c6644";
export const WOOD_DARK = "#5c3d26";

export const SNOW = "#dbe5f3";
export const SNOW_HI = "#f4f8ff";
export const SNOW_SHADE = "#b9c9e1";
export const SNOW_DEEP = "#8ea4c6";
export const PINE = "#25504a";
export const PINE_LIGHT = "#356b60";
export const PINE_DARK = "#163633";
export const SLATE = "#5d6b82";
export const SLATE_LIGHT = "#8796ad";
export const SLATE_DARK = "#3c4759";
export const NAVY = "#081022";
export const NAVY_2 = "#0b1730";
export const NAVY_3 = "#1d3563";
export const FROST = "#a8c8f0";
export const RULE = "#3a64a8";
export const RULE_DIM = "#22406f";
export const GATE_RED = "#e5484d";
export const GATE_BLUE = "#3b82f6";
export const GATE_GOLD = "#ffd166";
export const POLE = "#d5dde8";
export const SKI = "#e5484d";
export const SKI_TIP = "#1d3563";

export type Art = { w: number; h: number; px: Px[] };

// Shadow every object casts down-right of its base, drawn first.
function shadow(x: number, y: number, w: number): Px {
  return [x, y, w, 1, SNOW_DEEP, 0.55];
}

/** A tiered pine from row spans: each tier is [[x, w], ...] top to bottom. */
function pine(w: number, tiers: [number, number][][], trunk: [number, number, number]): Art {
  const px: Px[] = [];
  let y = 0;
  const rows: { y: number; x: number; w: number; tierTop: boolean; tierBottom: boolean }[] = [];
  for (const tier of tiers) {
    tier.forEach(([x, rw], i) => {
      rows.push({ y, x, w: rw, tierTop: i === 0, tierBottom: i === tier.length - 1 });
      y++;
    });
  }
  const [tx, tw, th] = trunk;
  const h = y + th + 1;
  px.push(shadow(tx - 1, h - 1, w - tx + 1));
  for (let i = 0; i < th; i++) px.push([tx, y + i, tw, 1, WOOD_DARK]);
  px.push([tx, y, 1, th, WOOD]);
  for (const r of rows) {
    px.push([r.x, r.y, r.w, 1, PINE]);
    px.push([r.x, r.y, Math.max(1, Math.floor(r.w / 3)), 1, PINE_LIGHT]);
    px.push([r.x + r.w - 1, r.y, 1, 1, PINE_DARK]);
    // Snow settles on the top of each tier and clumps on the branch tips
    if (r.tierTop) px.push([r.x, r.y, Math.max(1, r.w - 1), 1, SNOW_HI]);
    if (r.tierBottom && r.w > 4) {
      px.push([r.x, r.y, 2, 1, SNOW_HI]);
      px.push([r.x + r.w - 2, r.y, 1, 1, SNOW_SHADE]);
    }
  }
  return { w, h, px };
}

export const PINE_ART: Art = pine(
  15,
  [
    [[7, 1], [6, 3], [5, 5], [4, 7]],
    [[5, 5], [4, 7], [3, 9], [2, 11]],
    [[4, 7], [3, 9], [2, 11], [1, 13], [0, 15]],
  ],
  [6, 3, 3],
);

export const PINE_SM_ART: Art = pine(
  11,
  [
    [[5, 1], [4, 3], [3, 5]],
    [[3, 5], [2, 7], [1, 9]],
    [[2, 7], [1, 9], [0, 11]],
  ],
  [4, 3, 2],
);

export const ROCK_ART: Art = {
  w: 13,
  h: 8,
  px: [
    shadow(2, 7, 11),
    [1, 3, 11, 3, SLATE],
    [0, 4, 12, 2, SLATE],
    [0, 4, 3, 1, SLATE_LIGHT],
    [1, 3, 4, 1, SLATE_LIGHT],
    [9, 3, 3, 3, SLATE_DARK],
    [0, 6, 12, 1, SLATE_DARK],
    [3, 1, 6, 1, SNOW_HI],
    [2, 2, 8, 1, SNOW_HI],
    [8, 2, 2, 1, SNOW_SHADE],
  ],
};

export const STUMP_ART: Art = {
  w: 9,
  h: 7,
  px: [
    shadow(2, 6, 7),
    [1, 2, 6, 4, WOOD],
    [1, 2, 2, 4, WOOD_LIGHT],
    [6, 2, 1, 4, WOOD_DARK],
    [1, 1, 6, 1, WOOD_LIGHT],
    [1, 0, 6, 1, SNOW_HI],
    [0, 5, 2, 1, SNOW_HI],
  ],
};

export const MOGUL_ART: Art = {
  w: 15,
  h: 6,
  px: [
    [3, 5, 12, 1, SNOW_DEEP, 0.45],
    [3, 0, 7, 1, SNOW_HI],
    [1, 1, 11, 1, SNOW_HI],
    [0, 2, 6, 1, SNOW_HI],
    [6, 2, 8, 1, SNOW_SHADE],
    [1, 3, 13, 1, SNOW_SHADE],
    [3, 4, 10, 1, SNOW_DEEP, 0.7],
  ],
};

// A kicker built across the fall line, seen from uphill: you ride up the
// bright face from the top edge, and the lip is the frost line near the bottom
// with the drop's shaded face below it. Chevrons point the way off.
export const RAMP_ART: Art = {
  w: 18,
  h: 9,
  px: [
    [2, 8, 16, 1, SNOW_DEEP, 0.4],
    [3, 0, 12, 1, SNOW_SHADE],
    [2, 1, 14, 1, SNOW_HI],
    [1, 2, 16, 2, SNOW_HI],
    [0, 4, 18, 1, SNOW_HI],
    [15, 1, 1, 1, SNOW_SHADE],
    [16, 2, 1, 2, SNOW_SHADE],
    [17, 4, 1, 1, SNOW_SHADE],
    [0, 5, 18, 1, FROST],
    [0, 6, 18, 2, SNOW_DEEP],
    [11, 6, 7, 2, NAVY_3, 0.35],
    [6, 1, 1, 1, GATE_BLUE],
    [7, 2, 1, 1, GATE_BLUE],
    [8, 3, 2, 1, GATE_BLUE],
    [10, 2, 1, 1, GATE_BLUE],
    [11, 1, 1, 1, GATE_BLUE],
  ],
};

/** One slalom flag. `color` is the pennant; the pole is shared. */
export function flagArt(color: string, side: "left" | "right"): Art {
  // The pennant flies outward, away from the gap, so the gap reads at a glance.
  const base = side === "left" ? 0 : 3;
  const px: Px[] = [
    shadow(2, 13, 4),
    [2, 0, 1, 13, POLE],
    [2, 0, 1, 1, NAVY_3],
    [base, 1, 2, 4, color],
    [side === "left" ? base : base + 1, 5, 1, 1, color],
  ];
  return { w: 5, h: 14, px };
}

// The yeti — white fur shaded frost-blue, a navy face, a red mouth. Two run
// frames swap which arm is up; the grab frame has both up. Then, as in
// SkiFree, it eats the skier: a wide-open gulp, two chewing frames with a full
// belly, and a two-frame victory hop.
const FUR = "#f6f9ff";
const FUR_SHADE = "#c3d3ea";
const FUR_DEEP = "#8aa3c7";
const FACE = NAVY_3;
const EYE = "#eef6ff";

type YetiFrame = "a" | "b" | "grab" | "gulp" | "chewA" | "chewB" | "hopA" | "hopB";

function yeti(frame: YetiFrame): Art {
  const chewing = frame === "chewA" || frame === "chewB";
  const hopping = frame === "hopA" || frame === "hopB";
  const px: Px[] = [shadow(3, 22, 14)];
  // legs (swap length per frame for a lumbering gait; tucked up mid-hop)
  const leftLeg = frame === "a" || frame === "hopA" ? 3 : 4;
  const rightLeg = frame === "b" || frame === "hopA" ? 3 : 4;
  px.push([4, 17, 4, leftLeg, FUR], [10, 17, 4, rightLeg, FUR]);
  px.push([3, 17 + leftLeg, 5, 1, FUR_DEEP], [10, 17 + rightLeg, 5, 1, FUR_DEEP]);
  // body
  px.push([3, 7, 12, 10, FUR], [13, 8, 2, 9, FUR_SHADE], [6, 10, 6, 6, FUR_SHADE]);
  px.push([4, 9, 1, 1, FUR_DEEP], [11, 15, 1, 1, FUR_DEEP], [7, 8, 1, 1, FUR_DEEP]);
  // a full belly once the skier is inside
  if (chewing || hopping) px.push([4, 10, 10, 8, FUR], [5, 11, 8, 6, FUR_SHADE], [12, 11, 2, 6, FUR_SHADE]);
  // head
  px.push([6, 0, 6, 1, FUR], [5, 1, 8, 6, FUR], [11, 1, 2, 6, FUR_SHADE]);
  px.push([6, 2, 6, 1, FUR_SHADE]);
  px.push([6, 3, 6, 3, FACE]);
  if (chewing) {
    // puffed cheeks, eyes squeezed shut
    px.push([4, 3, 1, 3, FUR], [13, 3, 1, 3, FUR_SHADE]);
    px.push([6, 3, 2, 1, FUR_DEEP], [10, 3, 2, 1, FUR_DEEP]);
  } else {
    px.push([7, 3, 1, 1, EYE], [10, 3, 1, 1, EYE]);
  }
  if (frame === "grab") {
    px.push([7, 4, 4, 2, GATE_RED], [7, 4, 1, 1, EYE], [10, 4, 1, 1, EYE]);
  } else if (frame === "gulp") {
    // jaw dropped wide, teeth top and bottom
    px.push([6, 4, 6, 3, GATE_RED], [7, 5, 4, 1, FACE], [6, 4, 1, 1, EYE], [11, 4, 1, 1, EYE], [6, 6, 1, 1, EYE], [11, 6, 1, 1, EYE]);
  } else if (frame === "chewA") {
    px.push([7, 5, 4, 1, FUR_DEEP]);
  } else if (frame === "chewB") {
    px.push([8, 5, 2, 1, GATE_RED]);
  } else if (hopping) {
    // a satisfied grin
    px.push([7, 5, 4, 1, GATE_RED], [7, 4, 1, 1, GATE_RED], [10, 4, 1, 1, GATE_RED]);
  } else {
    px.push([7, 5, 4, 1, GATE_RED], [8, 5, 1, 1, EYE]);
  }
  // arms
  const armUp = (x: number) => {
    px.push([x, 2, 2, 6, FUR], [x, 1, 1, 1, FACE], [x + 1, 0, 1, 1, FACE]);
  };
  const armDown = (x: number) => {
    px.push([x, 8, 2, 6, FUR], [x, 14, 1, 1, FACE], [x + 1, 14, 1, 1, FACE]);
  };
  // patting the full belly
  const armPat = (x: number, inward: number) => {
    px.push([x, 8, 2, 4, FUR], [x + inward, 12, 2, 2, FUR], [x + inward, 13, 1, 1, FACE]);
  };
  const up = (f: YetiFrame[]) => f.includes(frame);
  if (chewing) {
    armPat(1, frame === "chewA" ? 2 : 1);
    armPat(15, frame === "chewA" ? -2 : -1);
  } else {
    if (up(["a", "grab", "gulp", "hopA"])) armUp(1);
    else armDown(1);
    if (up(["b", "grab", "gulp", "hopA"])) armUp(15);
    else armDown(15);
  }
  return { w: 18, h: 23, px };
}

export const YETI_A = yeti("a");
export const YETI_B = yeti("b");
export const YETI_GRAB = yeti("grab");
export const YETI_GULP = yeti("gulp");
export const YETI_CHEW_A = yeti("chewA");
export const YETI_CHEW_B = yeti("chewB");
export const YETI_HOP_A = yeti("hopA");
export const YETI_HOP_B = yeti("hopB");

// The yeti's face alone, for the off-screen warning chip.
export const YETI_FACE: Art = {
  w: 8,
  h: 7,
  px: [
    [1, 0, 6, 1, FUR],
    [0, 1, 8, 6, FUR],
    [1, 2, 6, 3, FACE],
    [2, 2, 1, 1, EYE],
    [5, 2, 1, 1, EYE],
    [2, 4, 4, 1, GATE_RED],
  ],
};

// Ground texture tile: a few shade flecks and wind-carved sastrugi lines on
// the snow. Tiled under the world and scrolled with the camera.
export const GROUND_TILE = 128;
export const GROUND_FLECKS: Px[] = [
  [14, 22, 9, 1, SNOW_SHADE],
  [20, 23, 6, 1, SNOW_SHADE, 0.6],
  [78, 10, 2, 1, SNOW_DEEP, 0.5],
  [96, 58, 12, 1, SNOW_SHADE],
  [104, 59, 7, 1, SNOW_SHADE, 0.6],
  [40, 84, 2, 2, SNOW_HI],
  [58, 44, 1, 1, SNOW_DEEP, 0.6],
  [30, 108, 10, 1, SNOW_SHADE],
  [88, 100, 2, 1, SNOW_DEEP, 0.5],
  [6, 66, 1, 1, SNOW_DEEP, 0.5],
  [116, 120, 2, 2, SNOW_HI],
];

// The skier — a small bundled-up figure in an orange jacket and a red bobble
// hat, drawn facing right (the renderer mirrors it for left headings). Feet sit
// on the bottom row; the skis are drawn separately so they can rotate.
const JACKET = "#ff8a3d";
const JACKET_DARK = "#d9622a";
const HAT = GATE_RED;
const SKIN = "#f2c6a0";
const PANTS = NAVY_3;
const BOOT = NAVY;

export const SKIER_ART: Art = {
  w: 11,
  h: 16,
  px: [
    [4, 0, 2, 1, SNOW_HI], // bobble
    [3, 1, 4, 2, HAT],
    [3, 2, 4, 1, "#b8333a"],
    [3, 3, 4, 3, SKIN],
    [5, 4, 3, 1, NAVY_3], // goggles
    [6, 4, 1, 1, FROST],
    [2, 6, 6, 5, JACKET],
    [2, 6, 1, 5, "#ffb07a"], // moonlit edge
    [7, 6, 1, 5, JACKET_DARK],
    [6, 7, 3, 2, JACKET], // forward arm
    [9, 8, 1, 1, BOOT], // glove
    [9, 9, 1, 7, POLE], // pole
    [8, 15, 3, 1, SNOW_SHADE], // basket in the snow
    [3, 11, 4, 3, PANTS],
    [5, 11, 2, 3, "#14284d"],
    [3, 14, 5, 1, BOOT],
  ],
};
