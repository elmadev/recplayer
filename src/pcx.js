import { Transparency } from "elmajs";

/**
 * Reduced subset of the implementation of PCX files as they are supported by Across and Elma
 * Only version 3.0, 8bpp, single bitplane PCX files without scaline padding are supported
 */
export class PCX {
  /**
   *
   * @param {Uint8Array} buffer
   */
  constructor(buffer) {
    this.buffer = buffer;
    this.byteView = new Uint8Array(buffer);
    if (this.byteView[0] !== 0x0a) {
      throw new Error("Invalid PCX file");
    }
    this.header = {
      version: this.byteView[1],
      encoding: this.byteView[2],
      bpp: this.byteView[3],
      xmin: this._readLEWord(4),
      ymin: this._readLEWord(6),
      xmax: this._readLEWord(8),
      ymax: this._readLEWord(10),
      bitplanes: this.byteView[65],
      bpr: this._readLEWord(66),
    };
    if (this.header.version !== 5) {
      throw new Error("Only Version 3.0 PCX files are supported");
    }
    if (this.header.encoding !== 1) {
      throw new Error("Invalid PCX encoding");
    }
    if (this.header.bpp !== 8) {
      throw new Error("Only 8bpp PCX files are supported");
    }
    if (this.header.bitplanes !== 1) {
      throw new Error(
        "Only single bitplane PCX files are supported (Extended VGA)"
      );
    }
    if (this.header.bitplanes !== 1) {
      throw new Error(
        "Only single bitplane PCX files are supported (Extended VGA)"
      );
    }
    this.width = this.header.xmax - this.header.xmin + 1;
    this.height = this.header.ymax - this.header.ymin + 1;
    this._pixels = null;
  }

  _readLEWord(offset) {
    return this.byteView[offset] | (this.byteView[offset + 1] << 8);
  }

  getPalette() {
    if (this.byteView[this.buffer.byteLength - 769] !== 12) {
      throw new Error("Palette not found!");
    }
    return this.byteView.slice(this.buffer.byteLength - 768);
  }

  getPixels() {
    if (!this._pixels) {
      this._pixels = this._decompressPCXData();
    }
    return this._pixels;
  }

  _decompressPCXData() {
    const pixels = new Uint8Array(this.width * this.height);
    let offset = 128;
    for (let i = 0; i < this.height; i++) {
      let j = 0;
      while (j < this.header.bpr) {
        const byte1 = this.byteView[offset];
        offset++;
        let length = 1;
        let value = byte1;
        if ((byte1 & 0b11000000) == 0b11000000) {
          length = byte1 & 0b00111111;
          value = this.byteView[offset];
          offset++;
        }
        for (let x = 0; x < length; x++) {
          // skip buffer pixels
          if (j < this.width) {
            pixels[i * this.width + j] = value;
          }
          j++;
        }
      }
      if (this.header.bpr !== j) {
        throw new Error(
          "PCX images must have a decoding break at the end of each scanline"
        );
      }
    }
    return pixels;
  }

  _getTransparencyPaletteId(transparency) {
    switch (transparency) {
      case Transparency.Solid:
        return -1;
      case Transparency.Palette:
        return 0;
      case Transparency.TopLeft:
        return this.getPixels()[0];
      case Transparency.TopRight:
        return this.getPixels()[this.width - 1];
      case Transparency.BottomLeft:
        return this.getPixels()[this.height * (this.width - 1)];
      case Transparency.BottomRight:
        return this.getPixels()[this.height * this.width - 1];
    }
  }

  _colorize(palette, transparentPaletteId) {
    const colorPixels = new Uint8ClampedArray(this.width * this.height * 4);
    const pixels = this.getPixels();
    const size = this.width * this.height;
    for (let i = 0; i < size; i++) {
      const paletteId = pixels[i];
      const paletteOffset = 3 * paletteId;
      const colorOffset = 4 * i;
      colorPixels[colorOffset] = palette[paletteOffset];
      colorPixels[colorOffset + 1] = palette[paletteOffset + 1];
      colorPixels[colorOffset + 2] = palette[paletteOffset + 2];
      if (paletteId === transparentPaletteId) {
        colorPixels[colorOffset + 3] = 0;
      } else {
        colorPixels[colorOffset + 3] = 255;
      }
    }
    return colorPixels;
  }

  async getImage(palette, transparency) {
    const transparentPaletteId = this._getTransparencyPaletteId(transparency);
    const colorData = this._colorize(palette, transparentPaletteId);
    const imageData = new ImageData(colorData, this.width, this.height, {});
    const imageBitmap = await createImageBitmap(imageData);
    return { imageData, imageBitmap };
  }
}
