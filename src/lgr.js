import { LGR, PictureType, Transparency, Clip } from 'elmajs'
import { PCX } from './pcx'

var imgs = [
  "bike",
  "ground",
  "head",
  "sky",
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
  "myshirt"
];
var picts = [
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
  ["qfood1", "pict", 400, "u"],
  ["qfood2", "pict", 400, "u"],
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
  ["maskbig", "mask", , ""],
  ["maskhor", "mask", , ""],
  ["masklitt", "mask", , ""],
  ["barrel", "pict", 380, "s"],
  ["supphred", "pict", 380, "s"],
  ["suppvred", "pict", 380, "s"],
  ["support2", "pict", 380, "u"],
  ["support3", "pict", 380, "u"],
  ["support1", "pict", 380, "u"],
  ["suspdown", "pict", 380, "u"],
  ["suspup", "pict", 380, "u"],
  ["susp", "pict", 380, "u"]
];

const PicType = {
  [PictureType.Normal]: "pict",
  [PictureType.Texture]: "text",
  [PictureType.Mask]: "mask",
};

const PicClip = {
  [Clip.Unclipped]: "u",
  [Clip.Ground]: "g",
  [Clip.Sky]: "s",
};


function loading(canv) {
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

function borders_legacy(mkCanv, img, up) {
  var data;
  var canve = mkCanv(img.width, img.height);
  var canv = canve.getContext("2d");
  img.drawAt(canv);
  try {
    // throws security error in Firefox and Chrome
    data = canv.getImageData(0, 0, img.width, img.height).data;
  } catch (e) {
    console.log(e);
  }
  var o = [];
  if (data){
    // Even if no error is thrown, this doesn't seem to quite work properly
    for (var x = 0; x < img.width; x++) {
      for (
        var y = 0;
        (y < img.height) && (data[4 * (y * img.width + x) + 3] === 0);
        y++
      );
      o.push(y);
    }
  } else {
    // Fallback is used on Firefox and Chrome
    var diff = img.height - 41;
    var from = img.height / 2 + (up ? 1 : -1) * diff / 2;
    var to = img.height / 2 + (up ? -1 : 1) * diff / 2;
    for (var x = 0; x < img.width; x++)
      o.push(from + (to - from) * (x / img.width));
  }
  return o;
}

function borders(imgData) {
  let {data, width, height} = imgData
  let heightmap = [];
  for (let j = 0; j < width; j++) {
    let i;
    for (
      i = 0;
      (i < height) && (data[4 * (i * width + j) + 3] === 0);
      i++
    );
    heightmap.push(i);
  }
  return heightmap;
}

export default function(lgrFile, path, mkImage, mkCanv) {
  var r = { _ident: {}, picts: {}, img_lazy: img_lazy };

  var numLoading = 0;
  var listeners = [];
  var afterLoad;

  function allLoaded() {
    var ls = listeners;
    listeners = [];
    ls.forEach(function(f) {
      f();
    });
    afterLoad && afterLoad();
  }

  // will call the given function the next time there are no images loading
  // optimally, should be called after trying to render a frame, so it's known
  //   that all required images are ready on the second render
  r.whenLoaded = function(l) {
    if (numLoading > 0) listeners.push(l);
    else l();
  };

  r.afterLoad = function(f) {
    afterLoad = f;
  };

  function lgr_lazy(name, palette, transparency, pcxData) {

    let img;
    let imgData;
    let isLoading = false;

    function ondone() {
      r._ident = {};
      if (cont) cont(pict);
      if (--numLoading == 0) allLoaded();
    }
  
    function requested() {
      if(isLoading) return false
      if (!img) {
        ++numLoading;
        isLoading = true;
        pcx.getImage(palette, transparency).then(({imageData: _imageData, imageBitmap: _imageBitmap}) => {
          imgData = _imageData
          img = _imageBitmap
          isLoading = false
          ondone();
        })
        return false;
      }
      return true;
    }

    const pict = {
      name: name,
      touch: requested,
  
      draw: function(canv) {
        if (requested()) canv.drawImage(img, 0, 0, 1, 1);
        else loading(canv);
      },

      drawAt: function(canv) {
        if (requested()) canv.drawImage(img, 0, 0);
        else {
          canv.save();
          canv.scale(48, 48);
          loading(canv);
          canv.restore();
        }
      },

      repeat: function(canv, w, h) {
        if (requested()) {
          canv.fillStyle = canv.createPattern(img, "repeat");
          canv.fillRect(0, 0, w, h);
        } else {
          canv.save();
          canv.fillStyle = "blue";
          canv.fillRect(0, 0, w, h);
          canv.beginPath();
          canv.strokeStyle = "white";
          for (var x = 0; x <= w; x += 20) {
            canv.moveTo(x, 0);
            canv.lineTo(x, h);
          }
          for (var y = 0; y <= h; y += 20) {
            canv.moveTo(0, y);
            canv.lineTo(w, y);
          }
          canv.stroke();
          canv.restore();
        }
      },

      frame: function (canv, num, g, showGravity) {
        if (requested()) {
          num = Math.floor(num)
          const frames = Math.floor(img.width/40)
          canv.drawImage(img, (num % frames) * 40, 0, 40, img.height, 0, 0, 1, 1);
          // Draw gravity arrows
          if (g && showGravity) {
            canv.font = "1px Courier";
            canv.fillText(arrow(g), 0.2, 0.8);
          }
        } else {
          canv.save();
          canv.translate(0.5, 0.5);
          canv.rotate(Math.PI * 2 * num / 50);
          canv.translate(-0.5, -0.5);
          loading(canv);
          canv.restore();
        }
      }
    };

    if(transparency === undefined) transparency = Transparency.TopLeft
    const pcx = new PCX(pcxData);
    pict.width = pcx.width;
    pict.height = pcx.height;

    let cont = function(){}
    if (name.indexOf("qup_") == 0) {
      transparency = Transparency.TopLeft;
      grassUpCount++;
      cont = function(g) {
        g.borders = borders(imgData);
        grassUp.push(g);
        grassUp.sort(function(a, b) {
          return (a.name > b.name) - (a.name < b.name);
        });
      };
    }
    if (name.indexOf("qdown_") == 0) {
      transparency = Transparency.TopLeft;
      grassDownCount++;
      cont = function(g) {
        g.borders = borders(imgData);
        grassDown.push(g);
        grassDown.sort(function(a, b) {
          return (a.name > b.name) - (a.name < b.name);
        });
      };
    }

    return pict;
  }

  function img_lazy(path, cont) {
    return img_lazy_(path, null, cont);
  }

  function img_lazy_(path, name, cont) {
    var loaded = false,
      img,
      pict;

    function ondone() {
      r._ident = {};
      if (cont) cont(pict);
      if (--numLoading == 0) allLoaded();
    }

    function requested() {
      if (!img) {
        ++numLoading;
        img = mkImage();
        img.src = path;
        img.onload = function() {
          loaded = true;
          pict.width = img.width;
          pict.height = img.height;
          ondone();
        };
        img.onerror = ondone;
        return false;
      }
      return loaded;
    }

    return (pict = {
      name: name,

      touch: requested,

      width: 48,
      height: 48,

      draw: function(canv) {
        if (requested()) canv.drawImage(img, 0, 0, 1, 1);
        else loading(canv);
      },

      drawAt: function(canv) {
        if (requested()) canv.drawImage(img, 0, 0);
        else {
          canv.save();
          canv.scale(48, 48);
          loading(canv);
          canv.restore();
        }
      },

      repeat: function(canv, w, h) {
        if (requested()) {
          canv.fillStyle = canv.createPattern(img, "repeat");
          canv.fillRect(0, 0, w, h);
        } else {
          canv.save();
          canv.fillStyle = "blue";
          canv.fillRect(0, 0, w, h);
          canv.beginPath();
          canv.strokeStyle = "white";
          for (var x = 0; x <= w; x += 20) {
            canv.moveTo(x, 0);
            canv.lineTo(x, h);
          }
          for (var y = 0; y <= h; y += 20) {
            canv.moveTo(0, y);
            canv.lineTo(w, y);
          }
          canv.stroke();
          canv.restore();
        }
      },

      frame: function (canv, num, g, showGravity) {
        if (requested()) {
          num = Math.floor(num)
          const frames = Math.floor(img.width/40)
          canv.drawImage(img, (num % frames) * 40, 0, 40, img.height, 0, 0, 1, 1);
          // Draw gravity arrows
          if (g && showGravity) {
            canv.font = "1px Courier";
            canv.fillText(arrow(g), 0.2, 0.8);
          }
        } else {
          canv.save();
          canv.translate(0.5, 0.5);
          canv.rotate(Math.PI * 2 * num / 50);
          canv.translate(-0.5, -0.5);
          loading(canv);
          canv.restore();
        }
      }
    });
  }

  function arrow(g) {
    if (g == 1) return "\u2191";
    if (g == 2) return "\u2193";
    if (g == 3) return "\u2190";
    if (g == 4) return "\u2192";
    return "";
  }

  var grassUp = [],
    grassDown = [],
    grassUpCount = 0,
    grassDownCount = 0;

  // Load images from a folder containing png files if no lgr is provided (legacy)
  // or else load directly from a .lgr file
  if(!lgrFile) {
    imgs.forEach(function (i) {
      r[i] = img_lazy_(path + "/" + i + ".png", i);
    });
    picts.forEach(function(info) {
      var add;
      var i = info[0];
      if (i.indexOf("qup_") == 0) {
        grassUpCount++;
        add = function(g) {
          g.borders = borders_legacy(mkCanv, g, true);
          grassUp.push(g);
          grassUp.sort(function(a, b) {
            return (a.name > b.name) - (a.name < b.name);
          });
        };
      }
      if (i.indexOf("qdown_") == 0) {
        grassDownCount++;
        add = function(g) {
          g.borders = borders_legacy(mkCanv, g, false);
          grassDown.push(g);
          grassDown.sort(function(a, b) {
            return (a.name > b.name) - (a.name < b.name);
          });
        };
      }
  
      var img = (r.picts[i] = img_lazy_(path + "/picts/" + i + ".png", i, add));
      img.type = info[1];
      img.dist = info[2];
      img.clipping = info[3];
    });
  } else {
    const lgr = LGR.from(lgrFile)
    const pictureListLookup = lgr.pictureList.reduce((obj, val) => {obj[val.name.toLowerCase()]= val; return obj}, {})
    const q1bike = new PCX(lgr.pictureData.find(picture => picture.name.toLowerCase() === 'q1bike.pcx').data)
    const palette = q1bike.getPalette()
    lgr.pictureData.forEach(function (pictureData) {
      const name = pictureData.name.toLowerCase().slice(0, pictureData.name.length - 4)
      const listInfo = pictureListLookup[name]
      let transparency = listInfo?.pictureType === PictureType.Texture ? Transparency.Solid : listInfo?.transparency
      if (name === 'qgrass') transparency = Transparency.Solid
      const img = (r.picts[name] = lgr_lazy(name, palette, transparency, pictureData.data));
      if(listInfo){
        img.type = PicType[listInfo.pictureType]
        img.dist = listInfo.distance
        img.clipping = img.type !== 'mask' ? PicClip[listInfo.clipping] : ''
      }
    })
    // legacy support
    r.bike = r.picts.q1bike
    r.wheel = r.picts.q1wheel
    r.head = r.picts.q1head
    r.q1body = r.picts.q1body
    r.q1up_arm = r.picts.q1up_arm
    r.q1forarm = r.picts.q1forarm
    r.q1thigh = r.picts.q1thigh
    r.q1leg = r.picts.q1leg
    r.susp1 = r.picts.q1susp1
    r.susp2 = r.picts.q1susp2
    r.qfood1 = r.picts.qfood1
    r.qfood2 = r.picts.qfood2
    r.qkiller = r.picts.qkiller
    r.qexit = r.picts.qexit
  }

  r.grassUp = function() {
    if (grassUp.length < grassUpCount)
      picts.forEach(function(i) {
        if (i[0].indexOf("qup_") == 0) r.picts[i[0]].touch();
      });
    return grassUp;
  };

  r.grassDown = function() {
    if (grassDown.length < grassDownCount)
      picts.forEach(function(i) {
        if (i[0].indexOf("qdown_") == 0) r.picts[i[0]].touch();
      });
    return grassDown;
  };

  return r;
}
