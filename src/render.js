import elmajs from "elmajs";
const { LGR: ElmaLGR, PictureType, Transparency } = elmajs;
import { PCX } from "elma-pcx";
import levReader from "./levReader.js";
import recReader from "./recReader.js";
import player from "./player.js";

// Node.js-compatible LGR image that loads synchronously via node-canvas APIs.
// Mirrors the interface of LGRImage in lgr.js but without browser dependencies.
class NodeLGRImage {
  constructor(lgr, name) {
    this.lgr = lgr;
    this.name = name;
    this.image = null;
    this.imageData = null;
    this.borders = null;
    this.width = null;
    this.height = null;
  }

  getImage() {
    return this.image;
  }

  isGrassUp() {
    return this.name.startsWith("qup_");
  }

  isGrassDown() {
    return this.name.startsWith("qdown_");
  }

  _calcHeightmap() {
    if (this.imageData) {
      const { data, width, height } = this.imageData;
      const heightmap = [];
      for (let j = 0; j < width; j++) {
        let i;
        for (i = 0; i < height && data[4 * (i * width + j) + 3] === 0; i++);
        heightmap.push(i);
      }
      this.borders = heightmap;
    } else {
      const up = this.isGrassUp();
      const diff = this.height - 41;
      const from = this.height / 2 + ((up ? 1 : -1) * diff) / 2;
      const to = this.height / 2 + ((up ? -1 : 1) * diff) / 2;
      this.borders = Array.from({ length: this.width }, (_, x) =>
        from + (to - from) * (x / this.width)
      );
    }
  }

  _updateGrass() {
    if (this.isGrassUp()) {
      this.lgr.grassUp.push(this);
      this._calcHeightmap();
    }
    if (this.isGrassDown()) {
      this.lgr.grassDown.push(this);
      this._calcHeightmap();
    }
  }

  draw(canv) {
    if (this.image) canv.drawImage(this.image, 0, 0, 1, 1);
  }

  drawAt(canv) {
    if (this.image) canv.drawImage(this.image, 0, 0);
  }

  repeat(canv, w, h) {
    if (this.image) {
      canv.fillStyle = canv.createPattern(this.image, "repeat");
      canv.fillRect(0, 0, w, h);
    }
  }

  frame(canv, frameNum, gravity, showGravityArrows) {
    if (!this.image) return;
    const f = Math.floor(frameNum);
    const totalFrames = Math.floor(this.image.width / 40);
    canv.drawImage(
      this.image,
      (f % totalFrames) * 40, 0, 40, this.image.height,
      0, 0, 1, 1
    );
  }
}

class NodePCXImage extends NodeLGRImage {
  constructor(lgr, name, pcxData, createCanvas, createImageData) {
    super(lgr, name);
    this._createCanvas = createCanvas;
    this._createImageData = createImageData;
    this._pcx = new PCX(pcxData);
    this.width = this._pcx.width;
    this.height = this._pcx.height;
  }

  _getTransparency() {
    const entry = this.lgr.pictureList[this.name];
    let tr = entry?.transparency ?? Transparency.TopLeft;
    if (entry?.pictureType === PictureType.Texture) tr = Transparency.Solid;
    if (this.name === "qgrass") tr = Transparency.Solid;
    if (this.isGrassUp() || this.isGrassDown() || this.name.startsWith("qfood"))
      tr = Transparency.TopLeft;
    return tr;
  }

  // Synchronous load using node-canvas createImageData + putImageData.
  // Replaces the browser-only createImageBitmap path in lgr.js PCXImage.
  loadSync() {
    const colorData = new Uint8ClampedArray(
      this._pcx.getImage(this.lgr.palette, this._getTransparency())
    );
    this.imageData = this._createImageData(colorData, this.width, this.height);
    const tmpCanvas = this._createCanvas(this.width, this.height);
    tmpCanvas.getContext("2d").putImageData(this.imageData, 0, 0);
    this.image = tmpCanvas;
    this._updateGrass();
  }
}

class NodeLGRWrapper {
  constructor(lgrBytes, createCanvas, createImageData) {
    this._ident = {};
    this.playerInvalidate = () => { };
    this.picts = {};
    this.grassUp = [];
    this.grassDown = [];

    const lgr = ElmaLGR.from(lgrBytes);

    this.pictureList = lgr.pictureList.reduce((acc, entry) => {
      acc[entry.name.toLowerCase()] = entry;
      return acc;
    }, {});

    const q1bikeEntry = lgr.pictureData.find(
      (p) => p.name.toLowerCase() === "q1bike.pcx"
    );
    this.palette = new PCX(q1bikeEntry.data).getPalette();

    lgr.pictureData.forEach((pd) => {
      const name = pd.name.toLowerCase().slice(0, pd.name.length - 4);
      const img = new NodePCXImage(
        this, name, pd.data, createCanvas, createImageData
      );
      img.loadSync();
      this.picts[name] = img;
    });

    // Mirror assignFood from LGRWrapper: fill missing qfoodN slots by cycling
    let i = 1;
    while (i < 10 && this.picts[`qfood${i}`]) i++;
    let j = 1;
    while (i < 10) {
      this.picts[`qfood${i}`] = this.picts[`qfood${j}`];
      i++;
      j++;
    }
  }

  updated() {
    this._ident = {};
    this.playerInvalidate();
  }
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function toLatinString(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

async function setup({ levUrl, lgrUrl, recUrl }) {
  const { createCanvas, createImageData } = await import("canvas");

  const [levBytes, recBytes, lgrBytes] = await Promise.all([
    fetchBytes(levUrl),
    recUrl ? fetchBytes(recUrl) : null,
    fetchBytes(lgrUrl),
  ]);

  const levRd = levReader(toLatinString(levBytes));
  const recRd = recBytes ? recReader(toLatinString(recBytes)) : null;
  const lgr = new NodeLGRWrapper(lgrBytes, createCanvas, createImageData);

  const pl = player(levRd, lgr, (w, h) => createCanvas(w, h), false);
  if (recRd) pl.addReplay(recRd, recUrl ?? "replay", [null]);

  return { pl, recRd, lgr, createCanvas };
}

/**
 * Render a single frame of a replay to a PNG buffer.
 * Requires the `canvas` npm package.
 *
 * @param {object}  opts
 * @param {string}  opts.levUrl      - URL to the .lev file
 * @param {string}  opts.lgrUrl      - URL to the .lgr file
 * @param {string}  [opts.recUrl]    - URL to the .rec file
 * @param {number}  [opts.frame=0]   - Frame number (30 fps)
 * @param {number}  [opts.timestamp] - Time in seconds (overrides frame)
 * @param {number}  [opts.width=600]
 * @param {number}  [opts.height=480]
 * @param {number}  [opts.scale]         - Zoom scale (< 1 shows more area, > 1 zooms in; default fits the level)
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function renderFrame({
  levUrl,
  lgrUrl,
  recUrl,
  frame,
  timestamp,
  width = 600,
  height = 480,
  scale,
}) {
  const { pl, createCanvas } = await setup({ levUrl, lgrUrl, recUrl });

  if (scale !== undefined) pl.setScale(scale);

  const frameNumber =
    timestamp !== undefined ? timestamp * 30 : (frame ?? 0);

  const canvas = createCanvas(width, height);
  pl.drawFrame(canvas.getContext("2d"), 0, 0, width, height, frameNumber);

  return canvas.toBuffer("image/png");
}

/**
 * Render an animated GIF of a replay.
 * Requires the `canvas` npm package, plus either `gif-encoder-2` (default) or `omggif` (indexed mode).
 *
 * @param {object}  opts
 * @param {string}  opts.levUrl           - URL to the .lev file
 * @param {string}  opts.lgrUrl           - URL to the .lgr file
 * @param {string}  [opts.recUrl]         - URL to the .rec file
 * @param {number}  [opts.interval=1]     - Seconds between captured frames (supports fractions, e.g. 0.5)
 * @param {number}  [opts.speed=1]        - Playback speed multiplier (2 = twice as fast, 0.5 = half speed)
 * @param {number}  [opts.startTime=0]    - Start time in seconds
 * @param {number}  [opts.endTime]        - End time in seconds (defaults to replay duration)
 * @param {number}  [opts.width=600]
 * @param {number}  [opts.height=480]
 * @param {number}  [opts.scale]          - Zoom scale (< 1 shows more area, > 1 zooms in; default fits the level)
 * @param {number}  [opts.repeat=0]       - 0 = loop forever, -1 = no loop, n = loop n times
 * @param {boolean} [opts.indexed=false]  - Use the LGR's own 256-color palette directly (requires omggif).
 *                                          Skips NeuQuant analysis; also disables canvas smoothing so rendered
 *                                          pixels stay closer to palette colors.
 * @param {number}  [opts.quality=1]      - NeuQuant palette quality (ignored when indexed=true):
 *                                          1 = sample every pixel (best colors), higher = faster but worse at small sizes
 * @returns {Promise<Buffer>} Animated GIF buffer
 */
export async function renderGif({
  levUrl,
  lgrUrl,
  recUrl,
  interval = 1,
  speed = 1,
  startTime = 0,
  endTime,
  width = 600,
  height = 480,
  scale,
  repeat = 0,
  indexed = false,
  quality = 1,
}) {
  const { pl, recRd, lgr, createCanvas } = await setup({ levUrl, lgrUrl, recUrl });

  if (scale !== undefined) pl.setScale(scale);

  const totalDuration = recRd ? recRd.frameCount() / 30 : 0;
  const end = endTime !== undefined ? endTime : totalDuration;

  const delay = interval * (indexed ? 100 : 1000) / speed;

  if (indexed) {
    let GifWriter;
    try {
      ({ GifWriter } = await import("omggif"));
    } catch {
      throw new Error("omggif is required for indexed GIF rendering — run: npm install omggif");
    }

    // LGR palette: Uint8Array[768] of [r,g,b, r,g,b, ...]
    // omggif needs number[256] of packed 0xRRGGBB
    const pal = lgr.palette;
    const omggifPalette = Array.from({ length: 256 }, (_, i) =>
      (pal[i * 3] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3 + 2]
    );

    // Cache nearest-palette-index lookups — repeated colors (common in game frames) are free after first hit
    const colorCache = new Map();
    function nearestIndex(r, g, b) {
      const key = (r << 16) | (g << 8) | b;
      let idx = colorCache.get(key);
      if (idx !== undefined) return idx;
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < 256; i++) {
        const dr = r - pal[i * 3];
        const dg = g - pal[i * 3 + 1];
        const db = b - pal[i * 3 + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      colorCache.set(key, best);
      return best;
    }

    const numFrames = Math.floor((end - startTime) / interval + 1e-9) + 1;
    const bufSize = (width * height * 2 + 1024) * numFrames + 4096;
    const buf = Buffer.alloc(bufSize);
    const loopOpts = repeat === -1 ? {} : { loop: repeat };
    const gf = new GifWriter(buf, width, height, { ...loopOpts, palette: omggifPalette });

    for (let t = startTime; t <= end + 1e-9; t += interval) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      // Disable smoothing so composited pixels stay as close to palette colors as possible
      ctx.imageSmoothingEnabled = false;
      pl.drawFrame(ctx, 0, 0, width, height, t * 30);
      const { data } = ctx.getImageData(0, 0, width, height);
      const pixels = new Uint8Array(width * height);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = nearestIndex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      }
      gf.addFrame(0, 0, width, height, pixels, { delay: Math.round(delay) });
    }

    return buf.slice(0, gf.end());
  }

  let GifEncoder;
  try {
    GifEncoder = (await import("gif-encoder-2")).default;
  } catch {
    throw new Error("gif-encoder-2 is required for renderGif — run: npm install gif-encoder-2");
  }

  const gif = new GifEncoder(width, height);
  gif.setRepeat(repeat);
  gif.setDelay(delay);
  gif.setQuality(quality);
  gif.start();

  for (let t = startTime; t <= end + 1e-9; t += interval) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    pl.drawFrame(ctx, 0, 0, width, height, t * 30);
    gif.addFrame(ctx);
  }

  gif.finish();
  return gif.out.getData();
}
