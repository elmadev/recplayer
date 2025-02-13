import { LGR, PictureType, Transparency } from "elmajs";
import { PCX } from "elma-pcx";

const legacy_imgs = [
  "bike",
  //"ground",
  "head",
  //"sky",
  "susp1",
  "susp2",
  "wheel",
  "qfood1",
  "qfood2",
  "qkiller",
  "qexit",
  "q1body",
  "q1forarm",
  "q1leg",
  "q1thigh",
  "q1up_arm",
  //"myshirt",
];
const legacy_picts = [
  ["qgrass", "text", 400, "s"],
  ["qdown_1", "pict", 400, "s"],
  ["qdown_14", "pict", 400, "s"],
  ["qdown_5", "pict", 400, "s"],
  ["qdown_9", "pict", 400, "s"],
  ["qup_0", "pict", 400, "s"],
  ["qup_1", "pict", 400, "s"],
  ["qup_14", "pict", 400, "s"],
  ["qup_5", "pict", 400, "s"],
  ["qup_9", "pict", 400, "s"],
  ["qup_18", "pict", 400, "s"],
  ["qdown_18", "pict", 400, "s"],
  ["cliff", "pict", 400, "s"],
  ["stone1", "text", 750, "g"],
  ["stone2", "text", 750, "g"],
  ["stone3", "text", 750, "s"],
  ["st3top", "pict", 740, "s"],
  ["brick", "text", 750, "g"],
  //["qfood1", "pict", 400, "u"],
  //["qfood2", "pict", 400, "u"],
  ["bridge", "pict", 400, "u"],
  ["sky", "text", 800, "s"],
  ["tree2", "pict", 540, "s"],
  ["bush3", "pict", 440, "s"],
  ["tree4", "pict", 600, "s"],
  ["tree5", "pict", 600, "s"],
  ["log2", "pict", 420, "s"],
  ["sedge", "pict", 430, "s"],
  ["tree3", "pict", 560, "s"],
  ["plantain", "pict", 450, "u"],
  ["bush1", "pict", 550, "s"],
  ["bush2", "pict", 550, "s"],
  ["ground", "text", 800, "g"],
  ["flag", "pict", 450, "s"],
  ["secret", "pict", 550, "s"],
  ["hang", "pict", 434, "s"],
  ["edge", "pict", 440, "u"],
  ["mushroom", "pict", 430, "s"],
  ["log1", "pict", 420, "s"],
  ["tree1", "pict", 550, "s"],
  ["maskbig", "mask", null, ""],
  ["maskhor", "mask", null, ""],
  ["masklitt", "mask", null, ""],
  ["barrel", "pict", 380, "s"],
  ["supphred", "pict", 380, "s"],
  ["suppvred", "pict", 380, "s"],
  ["support2", "pict", 380, "u"],
  ["support3", "pict", 380, "u"],
  ["support1", "pict", 380, "u"],
  ["suspdown", "pict", 380, "u"],
  ["suspup", "pict", 380, "u"],
  ["susp", "pict", 380, "u"],
];

class LGRImage {
  constructor(lgr, name) {
    this.lgr = lgr;
    this.name = name;
    this.imageLoading = false;
    this.image = null;
    this.imageData = null;
    this.borders = null;
    this.width = null;
    this.height = null;
  }

  loadImage() {
    throw Error("Not implemented");
  }

  getImage() {
    if (this.image) {
      return this.image;
    }
    if (!this.imageLoading) {
      this.imageLoading = true;
      this.loadImage();
    }
    return false;
  }

  imageLoaded() {
    this.updateGrass();
    this.lgr.updated();
  }

  updateGrass() {
    if (this.isGrassUp()) {
      this.lgr.grassUp.push(this);
      this.calculateHeightmap();
    }
    if (this.isGrassDown()) {
      this.lgr.grassDown.push(this);
      this.calculateHeightmap();
    }
  }

  calculateHeightmap() {
    if (!this.imageData) {
      this.legacy_calculateHeightmap();
      return;
    }
    const { data, width, height } = this.imageData;
    const heightmap = [];
    for (let j = 0; j < width; j++) {
      let i;
      for (i = 0; i < height && data[4 * (i * width + j) + 3] === 0; i++);
      heightmap.push(i);
    }
    this.borders = heightmap;
  }

  legacy_calculateHeightmap() {
    const heightmap = [];
    const up = this.isGrassUp();
    const diff = this.height - 41;
    const from = this.height / 2 + ((up ? 1 : -1) * diff) / 2;
    const to = this.height / 2 + ((up ? -1 : 1) * diff) / 2;
    for (let x = 0; x < this.width; x++) {
      heightmap.push(from + (to - from) * (x / this.width));
    }
    this.borders = heightmap;
  }

  isGrassUp() {
    return this.name.startsWith("qup_");
  }

  isGrassDown() {
    return this.name.startsWith("qdown_");
  }

  static placeholder_image(canv) {
    canv.save();
    canv.lineWidth = 1 / 20;
    canv.strokeStyle = "red";
    canv.beginPath();
    canv.moveTo(0.5, 0);
    canv.lineTo(0.5, 1);
    canv.moveTo(0, 0.5);
    canv.lineTo(1, 0.5);
    canv.arc(0.5, 0.5, 0.5, 0, Math.PI * 2);
    canv.stroke();
    canv.restore();
  }

  static placeholder_texture(canv, w, h) {
    canv.save();
    canv.fillStyle = "blue";
    canv.fillRect(0, 0, w, h);
    canv.beginPath();
    canv.strokeStyle = "white";
    for (let x = 0; x <= w; x += 20) {
      canv.moveTo(x, 0);
      canv.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += 20) {
      canv.moveTo(0, y);
      canv.lineTo(w, y);
    }
    canv.stroke();
    canv.restore();
  }

  static placeholder_object(canv, frame) {
    canv.save();
    canv.translate(0.5, 0.5);
    canv.rotate((Math.PI * 2 * frame) / 50);
    canv.translate(-0.5, -0.5);
    this.placeholder_image(canv);
    canv.restore();
  }

  draw(canv) {
    const image = this.getImage();
    if (image) {
      canv.drawImage(image, 0, 0, 1, 1);
    } else {
      this.constructor.placeholder_image(canv);
    }
  }

  drawAt(canv) {
    const image = this.getImage();
    if (image) {
      canv.drawImage(image, 0, 0);
    } else {
      canv.save();
      canv.scale(48, 48);
      this.constructor.placeholder_image(canv);
      canv.restore();
    }
  }

  repeat(canv, w, h) {
    const image = this.getImage();
    if (image) {
      canv.fillStyle = canv.createPattern(image, "repeat");
      canv.fillRect(0, 0, w, h);
    } else {
      this.constructor.placeholder_texture(canv, w, h);
    }
  }

  static arrow(gravity) {
    switch (gravity) {
      case 1:
        return "\u2191";
      case 2:
        return "\u2193";
      case 3:
        return "\u2190";
      case 4:
        return "\u2192";
      default:
        return "";
    }
  }

  frame(canv, frame, gravity, showGravityArrows) {
    const image = this.getImage();
    if (image) {
      frame = Math.floor(frame);
      const totalFrames = Math.floor(image.width / 40);
      canv.drawImage(
        image,
        (frame % totalFrames) * 40,
        0,
        40,
        image.height,
        0,
        0,
        1,
        1
      );
      if (gravity && showGravityArrows) {
        canv.font = "1px Courier";
        canv.fillText(this.constructor.arrow(gravity), 0.2, 0.8);
      }
    } else {
      this.constructor.placeholder_object(canv, frame);
    }
  }
}

export class UrlImage extends LGRImage {
  constructor(lgr, name, url) {
    super(lgr, name);
    this.url = url;
    // Placeholder values
    this.width = 48;
    this.height = 48;
  }

  loadImage() {
    const _image = document.createElement("img");
    _image.src = this.url;
    _image.onload = () => {
      this.width = _image.width;
      this.height = _image.height;
      this.image = _image;
      this.imageLoaded();
    };
  }
}

export class PCXImage extends LGRImage {
  constructor(lgr, name, pcxData) {
    super(lgr, name);
    this.palette = lgr.palette;
    this.pcx = new PCX(pcxData);
    this.width = this.pcx.width;
    this.height = this.pcx.height;
  }

  getTransparency() {
    const pictureList = this.lgr.pictureList[this.name];
    let transparency = pictureList?.transparency || Transparency.TopLeft;
    if (pictureList?.pictureType === PictureType.Texture) {
      transparency = Transparency.Solid;
    }
    if (this.name === "qgrass") {
      transparency = Transparency.Solid;
    }
    if (
      this.isGrassUp() ||
      this.isGrassDown() ||
      this.name.startsWith("qfood")
    ) {
      transparency = Transparency.TopLeft;
    }
    return transparency;
  }

  loadImage() {
    const colorData = this.pcx.getImage(
      this.lgr.palette,
      this.getTransparency()
    );
    this.imageData = new ImageData(colorData, this.width, this.height, {});
    createImageBitmap(this.imageData).then((imageBitmap) => {
      this.image = imageBitmap;
      this.imageLoaded();
    });
  }
}

export class LGRWrapper {
  constructor(lgrFile, legacy_path) {
    this._ident = {};
    this.playerInvalidate = function () {}; // callback function for player.js
    this.picts = {};
    this.grassUp = [];
    this.grassDown = [];

    if (!lgrFile) {
      this.legacy_loadLgr(legacy_path);
    } else {
      this.loadLgr(lgrFile);
    }
  }

  legacy_loadLgr(legacy_path) {
    legacy_imgs.forEach((imageName) => {
      this.addImageFromUrl(imageName, `${legacy_path}/${imageName}.png`);
    });
    legacy_picts.forEach((image) => {
      this.addImageFromUrl(image[0], `${legacy_path}/picts/${image[0]}.png`);
    });
    this.assignFood();
    // legacy images with non-standard names
    this.picts.q1bike = this.picts.bike;
    this.picts.q1wheel = this.picts.wheel;
    this.picts.q1head = this.picts.head;
    this.picts.q1susp1 = this.picts.susp1;
    this.picts.q1susp2 = this.picts.susp2;
  }

  loadLgr(lgrFile) {
    const lgr = LGR.from(lgrFile);
    this.pictureList = lgr.pictureList.reduce((obj, val) => {
      obj[val.name.toLowerCase()] = val;
      return obj;
    }, {});
    const q1bike = new PCX(
      lgr.pictureData.find(
        (picture) => picture.name.toLowerCase() === "q1bike.pcx"
      ).data
    );
    this.palette = q1bike.getPalette();
    lgr.pictureData.forEach((pictureDatum) => {
      const name = pictureDatum.name
        .toLowerCase()
        .slice(0, pictureDatum.name.length - 4);
      this.addImageFromPcx(name, pictureDatum.data);
    });
    this.assignFood();
  }

  addImageFromUrl(name, url) {
    return this._addImage(name, new UrlImage(this, name, url));
  }

  addImageFromPcx(name, pcxData) {
    return this._addImage(name, new PCXImage(this, name, pcxData));
  }

  _addImage(name, image) {
    this.picts[name] = image;
    if (image.isGrassUp() || image.isGrassDown()) {
      image.getImage();
    }
    return image;
  }

  assignFood() {
    // Define images for the unused animation objects
    let i = 1;
    while (i < 10) {
      if (!this.picts[`qfood${i}`]) {
        break;
      }
      i++;
    }
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
