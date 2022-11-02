import bikeRender from "./bikeRender";

function target(canv, x, y, s) {
  canv.beginPath();
  canv.moveTo(x - s / 2, y);
  canv.lineTo(x + s / 2, y);
  canv.moveTo(x, y - s / 2);
  canv.lineTo(x, y + s / 2);
  canv.stroke();
}

export default function recRender(reader) {
  var turnFrames = (function() {
    var fc = reader.frameCount();
    var o = [],
      t = 0;
    for (var f = 0; f < fc; f++) {
      var tmp = (reader.turn(f) >> 1) & 1;
      if (tmp != t) o.push(f);
      t = tmp;
    }
    return o;
  })();

  var volts = [];
  void (function() {
    var ec = reader.eventCount();
    var o = [];
    for (var e = 0; e < ec; e++)
      reader.event(e, function(time, info, type, a, b) {
        var frame = Math.ceil(time / 0.01456);
        switch (type) {
          case 5: // turn
            //							turnFrames.push(frame);
            break;
          case 6: // right volt
            volts.push([frame, true]);
            break;
          case 7: // left volt
            volts.push([frame, false]);
            break;
        }
      });
    return o;
  })();

  function lastTurn(frame) {
    for (var x = 0; x < turnFrames.length; x++)
      if (turnFrames[x] > frame) break;
    return x ? turnFrames[x - 1] : -1;
  }

  function lastVolt(frame) {
    for (var x = 0; x < volts.length; x++) if (volts[x][0] > frame) break;
    return x ? volts[x - 1] : null;
  }

  function interpolate(fn) {
    return function(n) {
      var f = Math.floor(n),
        o = n - f,
        r = fn(f);
      if (o == 0) return r;
      return r + (fn(f + 1) - r) * o;
    };
  }

  function interpolateAng(fn, mod) {
    return function(n) {
      var f = Math.floor(n),
        o = n - f,
        r = fn(f);
      if (o == 0) return r;
      var rs = fn(f + 1),
        offs = 0;
      var diff1 = rs - r,
        diff2 = (rs + mod / 2) % mod - (r + mod / 2) % mod;
      var diff = Math.abs(diff1) < Math.abs(diff2) ? diff1 : diff2;
      return r + diff * o;
    };
  }

  function turnScale(x) {
    return -Math.cos(x * Math.PI);
  }

  var bikeXi = interpolate(reader.bikeX);
  var bikeYi = interpolate(reader.bikeY);
  var bikeRi = interpolateAng(reader.bikeR, 10000);
  var leftXi = interpolate(reader.leftX);
  var leftYi = interpolate(reader.leftY);
  var leftRi = interpolateAng(reader.leftR, 250);
  var rightXi = interpolate(reader.rightX);
  var rightYi = interpolate(reader.rightY);
  var rightRi = interpolateAng(reader.rightR, 250);
  var headXi = interpolate(reader.headX);
  var headYi = interpolate(reader.headY);

  function wheel(canv, lgr, wheelX, wheelY, wheelR) {
    canv.save();
    canv.translate(wheelX, -wheelY);
    canv.rotate(-wheelR);
    canv.scale(38.4 / 48, 38.4 / 48);
    canv.translate(-0.5, -0.5);
    lgr.wheel.draw(canv);
    canv.restore();
  }

  // (x, y): top left in Elma coordinates
  // arguably a microoptimisation, but it doesn't produce any objects in the JS world
  function draw(canv, lgr, shirt, frame, x, y, scale) {
    var bikeCoords = {};
    bikeCoords.bikeR = bikeRi(frame);
    bikeCoords.turn = (reader.turn(Math.floor(frame)) >> 1) & 1;
    bikeCoords.leftX = leftXi(frame);
    bikeCoords.leftY = leftYi(frame);
    bikeCoords.leftR = leftRi(frame);
    bikeCoords.rightX = rightXi(frame);
    bikeCoords.rightY = rightYi(frame);
    bikeCoords.rightR = rightRi(frame);
    bikeCoords.headX = headXi(frame);
    bikeCoords.headY = headYi(frame);
    bikeCoords.lastTurnF = lastTurn(frame);
    bikeCoords.lv = lastVolt(frame);
    bikeRender(canv, lgr, shirt, frame, x, y, scale, bikeXi(frame), bikeYi(frame), bikeCoords);
  }

  return {
    draw: draw,
    bikeXi: bikeXi,
    bikeYi: bikeYi
  };
}
