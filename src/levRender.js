import quadTree from "./util/quadTree";
import geom from "./util/geom";

// canvas.cpp, grass.cpp, sprite.cpp and lgr.cpp are elma-classic sources.

function hypot(a, b) {
  return Math.sqrt(a * a + b * b);
}

export default function levRender(reader, lgr) {
  var polyTree = [];
  var grassPolys = [];

  function isSub(v, outer) {
    function hits(a, b) {
      // does the line [x, y]–[x, inf] intersect the line a–b?
      var left = Math.min(a[0], b[0]),
        right = Math.max(a[0], b[0]);
      if (v[0] < left || v[0] >= right) return false;
      var m = (b[1] - a[1]) / (b[0] - a[0]);
      var yint = m * (v[0] - a[0]) + a[1];
      return yint > v[1];
    }

    var n = 0;
    for (var z = 0; z < outer.length; z++)
      if (hits(outer[z], outer[(z + 1) % outer.length])) n++;
    return n % 2 != 0;
  }

  function addPoly(vertices, tree) {
    var newTree = [];
    for (var x = 0; x < tree.length; x++) {
      if (isSub(vertices[0], tree[x].vertices)) {
        // assertion: newTree non-empty or consistency error
        if (false && newTree.length)
          // actually, game itself doesn't care, only the editor
          throw new Error("inconsistent!");
        return addPoly(vertices, tree[x].inner);
      }
      if (isSub(tree[x].vertices[0], vertices)) {
        newTree.push(tree[x]);
        if (x + 1 == tree.length) tree.pop();
        else tree[x] = tree.pop();
        x--;
      }
    }
    return (tree[x] = { vertices: vertices, inner: newTree });
  }

  function traverse(tree, isSolid, fn) {
    tree.forEach(function(poly) {
      fn(isSolid, poly.vertices);
      traverse(poly.inner, !isSolid, fn);
    });
  }

  // level bounds, grass polygons excluded (segments.cpp)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  reader.polyReader(function(grass, count, vertices) {
    var poly = [];
    vertices(function(x, y) {
      if (!grass) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      poly.push([x, y]);
    });
    if (grass) grassPolys.push(poly);
    else addPoly(poly, polyTree);
  });

  // canvas.cpp: MARGIN_X, MARGIN_Y
  const CANVAS_MARGIN_X = 10000 / 48;
  const CANVAS_MARGIN_Y = 1000 / 48;

  function mod(a, n) {
    return (a % n + n) % n;
  }

  // canvas origin: level bounds plus a margin, snapped to pixel centres, y up
  function textureAnchor(scale) {
    if (!isFinite(minX) || !isFinite(maxY)) return { x: 0, y: 0 };
    return {
      x: Math.trunc((minX - CANVAS_MARGIN_X) * scale) + 0.5,
      y: 1 - (Math.trunc((-maxY - CANVAS_MARGIN_Y) * scale) + 0.5)
    };
  }

  // Where the texture's tiling starts, in viewport pixels
  function texturePhase(img, x, y, scale) {
    const anchor = textureAnchor(scale);
    return {
      x: -mod(Math.floor(Math.floor(x * scale) - anchor.x), img.width),
      y: -mod(Math.floor(Math.floor(y * scale) - anchor.y), img.height)
    };
  }

  // Tile img over the viewport, in the game's phase
  function fillTexture(canv, img, x, y, w, h, scale) {
    const phase = texturePhase(img, x, y, scale);
    img.repeat(
      canv,
      Math.ceil(w * scale),
      Math.ceil(h * scale),
      phase.x,
      phase.y
    );
  }

  var pictures = (function() {
    var tree;
    var maxImgW, maxImgH; // for overbounding in .traverse

    function traverse(x, y, w, h, fn) {
      tree.traverse(x - maxImgW, y - maxImgH, w + maxImgW, h + maxImgH, fn);
    }

    function calc() {
      tree = quadTree(1);
      maxImgW = maxImgH = 0;

      var count = reader.picCount();
      for (var x = 0; x < count; x++) {
        var pic = reader.pic_(x);
        pic.num = x;
        // TODO: defaults?
        tree.add(pic.x, pic.y, pic);
        [pic.picture, pic.mask, pic.texture].forEach(function(picname) {
          var img = lgr.picts[picname];
          if (img && img.width !== undefined && img.height !== undefined) {
            img.getImage();
            maxImgW = Math.max(maxImgW, img.width / 48);
            maxImgH = Math.max(maxImgH, img.height / 48);
          }
        });
      }
    }

    return {
      calc: calc,
      traverse: traverse,
      dbgdraw: function(canv, x, y, w, h) {
        tree.dbgdraw(canv, x, y, w, h);
      }
    };
  })();

  var grass = (function() {
    var tree;
    var maxImgW, maxImgH; // for overbounding in .traverse
    let seq; // the game's draw order
    const MAX_HEIGHTMAP_LENGTH = 10000; // canvas.cpp, at zoom 1

    // assuming w and h are positive
    function traverse(x, y, w, h, fn) {
      tree.traverse(x - maxImgW, y - maxImgH, w + maxImgW, h + maxImgH, fn);
    }

    function calc() {
      tree = quadTree(1);
      maxImgW = maxImgH = 0;
      seq = 0;

      grassPolys.forEach(function(p) {
        calcGrassPoly(48, p);
      });

      // heightmap of the grass line, one y per pixel column (grass.cpp)
      function heightmapFor(scale, poly) {
        let v1 = 0;
        let widest = 0;
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length;
          const length = Math.abs(poly[i][0] - poly[j][0]);
          if (length > widest) {
            v1 = i;
            widest = length;
          }
        }
        if (widest < 0.0001) return null;

        let v2 = (v1 + 1) % poly.length;
        const counterclockwise = !(poly[v1][0] < poly[v2][0]);

        const heightmap = [];
        let x0 = null;
        let cur = null;
        let done = false;

        function addLine(a, b) {
          const r1 = poly[a];
          const r2 = poly[b];
          if (r1[0] > r2[0]) return; // runs right to left

          const x1 = Math.floor(r1[0] * scale);
          const x2 = Math.floor(r2[0] * scale);
          const y1 = r1[1] * scale;
          const y2 = r2[1] * scale;

          if (cur === null) {
            x0 = x1;
            cur = x1;
            heightmap[0] = Math.floor(y1);
          }
          if (x1 >= x2) return;
          // past the cap, or a gap the walk can't cross: the line ends here,
          // and later edges can only start further right
          if (x1 - x0 >= MAX_HEIGHTMAP_LENGTH || cur < x1 - 1) {
            done = true;
            return;
          }

          for (let x = x1; x <= x2; x++) {
            if (x < cur) continue; // doubled back, keep what's there
            if (x - x0 >= MAX_HEIGHTMAP_LENGTH) {
              done = true;
              return;
            }
            heightmap[x - x0] = Math.floor(
              y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)
            );
            cur = x;
          }
        }

        for (let i = 0; i < poly.length - 1 && !done; i++) {
          const step = counterclockwise ? 1 : poly.length - 1;
          v1 = (v1 + step) % poly.length;
          v2 = (v2 + step) % poly.length;
          addLine(counterclockwise ? v1 : v2, counterclockwise ? v2 : v1);
        }

        if (x0 === null) return null;

        // fill in columns the walk missed
        for (let i = 1; i <= cur - x0; i++) {
          if (heightmap[i] === undefined) heightmap[i] = heightmap[i - 1];
        }

        return { x0: x0, heightmap: heightmap, length: cur - x0 + 1 };
      }

      function calcGrassPoly(scale, poly) {
        const map = heightmapFor(scale, poly);
        if (!map) return;

        const picts = lgr.grass.filter((pict) => pict.borders);
        if (!picts.length) return;

        const end = map.x0 + map.length;
        let x = map.x0;
        let y = map.heightmap[0];

        while (x < end) {
          // pick the picture whose slope lands closest to the line ahead
          let bestScore = Infinity;
          let bestPict = null;
          let bestFall = 0;
          for (const pict of picts) {
            const fall = (pict.height - 41) * (pict.isGrassUp() ? -1 : 1);
            const target = x + pict.width;
            const targetY =
              target >= end
                ? map.heightmap[map.length - 1]
                : map.heightmap[target - map.x0];
            const score = Math.abs(y + fall - targetY);
            if (score < bestScore) {
              bestScore = score;
              bestPict = pict;
              bestFall = fall;
            }
          }

          const top = y - Math.ceil((bestPict.height - bestFall) / 2);
          maxImgW = Math.max(maxImgW, bestPict.width / scale);
          maxImgH = Math.max(maxImgH, bestPict.height / scale);
          tree.add(x / scale, top / scale, { pict: bestPict, seq: seq++ });

          x += bestPict.width;
          y += bestFall;
        }
      }
    }

    return {
      calc: calc,
      traverse: traverse,
      dbgdraw: function(canv, x, y, w, h) {
        tree.dbgdraw(canv, x, y, w, h);
      }
    };
  })();

  function drawPicture(pic, canv, scale, x, y, w, h) {
    // a picture or a texture+mask pair, never both (sprite.cpp)
    let img = lgr.picts[pic.picture];
    if (img && img.draw) {
      // image dimensions are in pixels, the viewport is in Elma units
      if (
        !geom.rectsOverlap(
          pic.x,
          pic.y,
          img.width / 48,
          img.height / 48,
          x,
          y,
          w,
          h
        )
      )
        return;
      const left = Math.round(pic.x * scale);
      const top = Math.round(pic.y * scale);
      img.drawRect(
        canv,
        left,
        top,
        Math.round((pic.x + img.width / 48) * scale) - left,
        Math.round((pic.y + img.height / 48) * scale) - top
      );
      return;
    }
    img = lgr.picts[pic.texture];
    const mask = lgr.picts[pic.mask];
    if (img && img.draw && mask && mask.draw) {
      if (
        !geom.rectsOverlap(
          pic.x,
          pic.y,
          mask.width / 48,
          mask.height / 48,
          x,
          y,
          w,
          h
        )
      )
        return;
      // The texture tiles from the canvas origin rather than from this
      // picture's own corner, so masked pictures that sit next to each other
      // line up on one continuous pattern. Unlike the game, it tiles at its
      // native size no matter the zoom (lgr.cpp: texture_zoom).
      const anchor = textureAnchor(scale);
      const offsX = mod(Math.floor(pic.x * scale - anchor.x), img.width);
      const offsY = mod(Math.floor(pic.y * scale - anchor.y), img.height);
      mask.getImage();
      canv.save();
      canv.translate(pic.x * scale, pic.y * scale);
      img.repeat(
        canv,
        mask.width * scale / 48,
        mask.height * scale / 48,
        -offsX,
        -offsY
      );
      canv.restore();
    }
  }

  var lgrIdent = {};
  var optIdent = {};
  var optGrass = true;
  var optPictures = true;
  var optCustomBackgroundSky = true;

  const GRASS_DISTANCE = 600; // canvas.cpp

  // tie order: ground clipped, grass, sky clipped, unclipped (canvas.cpp)
  function tiePriority(item) {
    if (item.grass) return 1;
    const pic = item.pic || item;
    return pic.clipping == "g" ? 0 : pic.clipping == "s" ? 2 : 3;
  }

  // Paint order: furthest first, so whatever the game would keep ends up last
  function byDepth(a, b) {
    const pa = a.pic || a;
    const pb = b.pic || b;
    return (
      b.dist - a.dist ||
      tiePriority(b) - tiePriority(a) ||
      (pb.num || 0) - (pa.num || 0)
    );
  }

  // every polygon, in Elma dimensions
  let polyPath = null;

  // scratch layer for ground clipped drawing, reused across tiles
  let layerCanvas = null;
  function clearLayer(w, h, scale) {
    const pw = Math.ceil(w * scale);
    const ph = Math.ceil(h * scale);
    if (!layerCanvas) layerCanvas = document.createElement("canvas");
    if (layerCanvas.width != pw || layerCanvas.height != ph) {
      layerCanvas.width = pw;
      layerCanvas.height = ph;
    }
    const ctx = layerCanvas.getContext("2d");
    ctx.clearRect(0, 0, pw, ph);
    return ctx;
  }

  // the region ground clipped drawing is confined to, in viewport coordinates
  function groundPath(x, y, w, h, scale) {
    if (!polyPath) {
      polyPath = new Path2D();
      traverse(polyTree, false, function(isSolid, verts) {
        polyPath.moveTo(
          verts[verts.length - 1][0],
          verts[verts.length - 1][1]
        );
        for (let z = verts.length - 2; z >= 0; z--)
          polyPath.lineTo(verts[z][0], verts[z][1]);
      });
    }

    const path = new Path2D();
    path.moveTo(0, 0);
    path.lineTo(w * scale, 0);
    path.lineTo(w * scale, h * scale);
    path.lineTo(0, h * scale);
    path.addPath(
      polyPath,
      new DOMMatrix([scale, 0, 0, scale, -x * scale, -y * scale])
    );

    return path;
  }

  // outline a piece's qgrass fills, in picture pixels; keyed on the borders the
  // path was built from, which change when the image finishes loading
  const outlineCache = new WeakMap();
  function grassOutline(pict) {
    let cached = outlineCache.get(pict);
    if (!cached || cached.borders !== pict.borders) {
      const b = pict.borders;
      const path = new Path2D();
      // QGRASS_MARGIN - QUPDOWN_MARGIN rows of qgrass above the picture
      path.moveTo(0, -20);
      for (let z = 0; z < b.length; z++) {
        path.lineTo(z, b[z] + 1);
        path.lineTo(z + 1, b[z] + 1);
      }
      path.lineTo(pict.width, -20);
      path.closePath();
      cached = { borders: b, path: path };
      outlineCache.set(pict, cached);
    }
    return cached.path;
  }

  // draws into the ground clipped layer
  function drawGrass(canv, x, y, w, h, scale) {
    const pieces = [];
    grass.traverse(x, y, w, h + 24, function(grassX, grassY, piece) {
      pieces.push({ x: grassX, y: grassY, piece: piece });
    });
    if (!pieces.length) return;

    // Grass is all at one distance, where the game keeps the first thing
    // drawn, so pieces go back to front. Non-overlapping ones share a batch.
    pieces.sort(function(a, b) {
      return b.piece.seq - a.piece.seq;
    });

    const s = scale / 48;
    const qgrass = lgr.picts.qgrass;
    // null until qgrass is there and loaded; the pieces still get drawn
    let pattern = null;
    if (qgrass) {
      const phase = texturePhase(qgrass, x, y, scale);
      pattern = qgrass.pattern(canv, phase.x, phase.y);
    }
    if (pattern) canv.fillStyle = pattern;

    // what a piece covers, qgrass margin included, in Elma dimensions
    function box(p) {
      return {
        x1: p.x,
        x2: p.x + p.piece.pict.width / 48,
        y1: p.y - 20 / 48,
        y2: p.y + p.piece.pict.height / 48
      };
    }

    let batch = [];
    let boxes = [];

    function overlapsBatch(b) {
      for (let i = 0; i < boxes.length; i++) {
        const o = boxes[i];
        if (b.x1 < o.x2 && o.x1 < b.x2 && b.y1 < o.y2 && o.y1 < b.y2)
          return true;
      }
      return false;
    }

    function flush() {
      if (!batch.length) return;
      if (pattern) {
        const outlines = new Path2D();
        batch.forEach(function(p) {
          // half a pixel of overlap; a shared edge leaves a hairline
          const sx = s + 0.5 / p.piece.pict.width;
          outlines.addPath(
            grassOutline(p.piece.pict),
            new DOMMatrix([sx, 0, 0, s, (p.x - x) * scale, (p.y - y) * scale])
          );
        });
        canv.fill(outlines);
      }
      batch.forEach(function(p) {
        // whole pixels; fractional edges leave a seam
        const pict = p.piece.pict;
        const left = Math.round((p.x - x) * scale);
        const top = Math.round((p.y - y) * scale);
        pict.drawRect(
          canv,
          left,
          top,
          Math.round((p.x - x + pict.width / 48) * scale) - left,
          Math.round((p.y - y + pict.height / 48) * scale) - top
        );
      });
      batch = [];
      boxes = [];
    }

    pieces.forEach(function(p) {
      const b = box(p);
      if (overlapsBatch(b)) flush();
      batch.push(p);
      boxes.push(b);
    });
    flush();
  }

  // (x, y)–(x + w, y + h): viewport in Elma dimensions
  function draw(canv, x, y, w, h, scale) {
    if (lgrIdent != lgr._ident) {
      if (optGrass) grass.calc();
      if (optPictures) pictures.calc();
      lgrIdent = lgr._ident;
    }

    var pics = [];
    if (optPictures)
      pictures.traverse(x, y, w, h, function(x, y, pic) {
        pics.push(pic);
      });

    // sky clipped pictures carry +DISTANCE_SKY_CLIPPING_CORRECTION, which puts
    // them behind everything else
    pics
      .filter(function(pic) {
        return pic.clipping == "s";
      })
      .sort(byDepth)
      .forEach(function(pic) {
        canv.save();
        canv.translate(-x * scale, -y * scale);
        drawPicture(pic, canv, scale, x, y, w, h);
        canv.restore();
      });

    // clip isn't antialiased in Chromium—different with destination-out
    const ground = groundPath(x, y, w, h, scale);

    // Ground clipped drawing collects in a layer and is clipped once on the way
    // out; clipping each thing separately antialiases the same edge repeatedly
    // and leaves a hairline along the ground.
    const target = clearLayer(w, h, scale);

    void (function() {
      // TODO: check that it's not accessing something it shouldn't
      var img =
        (optCustomBackgroundSky && lgr.picts[reader.ground()]) ||
        lgr.picts.ground;
      fillTexture(target, img, x, y, w, h, scale);
    })();

    function flushGround() {
      canv.save();
      canv.clip(ground);
      canv.drawImage(target.canvas, 0, 0);
      canv.restore();
    }

    // pictures and grass share one distance buffer (canvas.cpp)
    const items = pics
      .filter(function(pic) {
        return pic.clipping != "s";
      })
      .map(function(pic) {
        return { pic: pic, dist: pic.dist, clipped: pic.clipping == "g" };
      });
    if (optGrass)
      items.push({ grass: true, dist: GRASS_DISTANCE, clipped: true });
    items.sort(byDepth);

    let clipped = true;
    items.forEach(function(item) {
      if (item.clipped != clipped) {
        if (clipped) flushGround();
        else clearLayer(w, h, scale); // start a fresh clipped batch
        clipped = item.clipped;
      }
      const dest = clipped ? target : canv;
      if (!item.pic) {
        drawGrass(dest, x, y, w, h, scale);
        return;
      }
      dest.save();
      dest.translate(-x * scale, -y * scale);
      drawPicture(item.pic, dest, scale, x, y, w, h);
      dest.restore();
    });
    if (clipped) flushGround();

    canv.strokeStyle = "#ff0000";
    if (window.dbg) {
      canv.strokeRect(0, 0, w * scale, h * scale);
      if (window.dbg > 1) {
        canv.save();
        canv.translate(-x * scale, -y * scale);
        canv.scale(scale, scale);
        canv.lineWidth = 1 / 48;
        canv.strokeStyle = "orange";
        if (window.dbg & 2) grass.dbgdraw(canv, x, y, w, h);
        canv.strokeStyle = "purple";
        if (window.dbg & 4) pictures.dbgdraw(canv, x, y, w, h);
        canv.restore();
      }
    }
  }

  function cached(num, mkCanv) {
    var cscale, xp, yp, wp, hp;
    var canvs = [];
    var cacheLgrIdent;
    var cacheOptIdent;
    let lastScale;

    function update(which, canv) {
      var x = which % num,
        y = Math.floor(which / num);
      x = xp + x * wp;
      y = yp + y * hp;
      var ctx = canv.getContext("2d");
      ctx.clearRect(0, 0, canv.width, canv.height);
      draw(ctx, x / cscale, y / cscale, wp / cscale, hp / cscale, cscale);
    }

    function invalid() {
      return (
        lgr._ident != lgrIdent ||
        cacheLgrIdent != lgrIdent ||
        cacheOptIdent != optIdent
      );
    }

    return function cachedDraw(canv, x, y, w, h, scale) {
      w = Math.ceil(w * scale);
      h = Math.ceil(h * scale);
      x = Math.floor(x * scale);
      y = Math.floor(y * scale);

      // Tiles cover 4/3 of the viewport, more than a zoom step needs, so
      // stretch them and re-render once the scale settles.
      if (canvs.length && !invalid() && scale != cscale && scale != lastScale) {
        const f = scale / cscale;
        const covers =
          xp * f <= x &&
          yp * f <= y &&
          (xp + num * wp) * f >= x + w &&
          (yp + num * hp) * f >= y + h;
        lastScale = scale;
        if (covers) {
          // edges rounded so that neighbouring tiles still share one, rather
          // than each landing on a fraction of a pixel and leaving a seam
          const edgeX = [];
          const edgeY = [];
          for (let i = 0; i <= num; i++) {
            edgeX.push(Math.round((xp + i * wp) * f) - x);
            edgeY.push(Math.round((yp + i * hp) * f) - y);
          }
          for (let xi = 0; xi < num; xi++)
            for (let yi = 0; yi < num; yi++)
              canv.drawImage(
                canvs[yi * num + xi],
                edgeX[xi],
                edgeY[yi],
                edgeX[xi + 1] - edgeX[xi],
                edgeY[yi + 1] - edgeY[yi]
              );
          return;
        }
      }
      lastScale = scale;

      if (
        invalid() ||
        scale != cscale ||
        Math.ceil(w / (num - 1)) != wp ||
        Math.ceil(h / (num - 1)) != hp ||
        !geom.rectsOverlap(xp, yp, wp * num, hp * num, x, y, w, h)
      ) {
        cacheLgrIdent = lgrIdent;
        cacheOptIdent = optIdent;
        wp = Math.ceil(w / (num - 1));
        hp = Math.ceil(h / (num - 1));
        xp = x - Math.floor(wp / 2);
        yp = y - Math.floor(hp / 2);
        cscale = scale;
        canvs = [];
        for (var z = 0; z < num * num; z++)
          update(z, (canvs[z] = mkCanv(wp, hp)));
      }
      // TODO: will render things unnecessarily if it jumps a whole column/row
      // doesn't matter when num == 2
      // should try to generalise this—whole thing looks unreadable
      while (yp > y) {
        // stuff missing from top
        yp -= hp;
        canvs.splice.apply(
          canvs,
          [0, 0].concat(canvs.splice(num * (num - 1), num))
        );
        for (var z = 0; z < num; z++) update(z, canvs[z]);
      }
      while (yp + num * hp < y + h) {
        // stuff missing from bottom
        yp += hp;
        canvs.splice.apply(
          canvs,
          [num * (num - 1), 0].concat(canvs.splice(0, num))
        );
        for (var z = 0; z < num; z++)
          update(num * (num - 1) + z, canvs[num * (num - 1) + z]);
      }
      while (xp > x) {
        // stuff missing from left
        xp -= wp;
        for (var z = 0; z < num; z++) {
          canvs.splice(z * num, 0, canvs.splice((z + 1) * num - 1, 1)[0]);
          update(z * num, canvs[z * num]);
        }
      }
      while (xp + num * wp < x + w) {
        // stuff missing from right
        xp += wp;
        for (var z = 0; z < num; z++) {
          canvs.splice((z + 1) * num - 1, 0, canvs.splice(z * num, 1)[0]);
          update((z + 1) * num - 1, canvs[(z + 1) * num - 1]);
        }
      }

      for (var xi = 0; xi < num; xi++)
        for (var yi = 0; yi < num; yi++)
          canv.drawImage(
            canvs[yi * num + xi],
            xp - x + xi * wp,
            yp - y + yi * hp
          );
    };
  }

  return {
    draw: draw,
    cached: cached,
    setGrass: function(v) {
      optGrass = v;
      optIdent = {};
    },
    setPictures: function(v) {
      optPictures = v;
      optIdent = {};
    },
    setCustomBackgroundSky: function(v) {
      optCustomBackgroundSky = v;
      optIdent = {};
    },
    drawSky: function(canv, x, y, w, h, scale) {
      // TODO: check that it's not accessing something it shouldn't
      var img =
        (optCustomBackgroundSky && lgr.picts[reader.sky()]) || lgr.picts.sky;
      const anchor = textureAnchor(scale);
      w *= scale;
      h *= scale;
      // parallax halves the canvas position (canvas.cpp: PARALLAX = 2), and the
      // sky is screen locked vertically, anchored at its bottom edge
      const viewLeft = Math.floor(x * scale - anchor.x);
      const offsX = mod(Math.trunc(viewLeft / 2), img.width);
      const offsY = mod(-Math.floor(h), img.height);
      img.repeat(canv, Math.ceil(w), Math.ceil(h), -offsX, -offsY);
    },
    bounds: function() {
      return { minX, minY, maxX, maxY };
    }
  };
}
