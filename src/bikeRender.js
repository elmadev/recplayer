function hypot(a, b) {
  return Math.sqrt(a * a + b * b);
}

// (x1, y1)–(x2, y2): line to draw image along
// bx: length of image used before (x1, y1)
// br: length of image used after (x2, y2)
// by: proportional (of ih) y offset within the image the line is conceptually along
// ih: image height
function skewimage(canv, img, bx, by, br, ih, x1, y1, x2, y2, box) {
  var o = x2 - x1,
    a = y2 - y1;
  canv.save();
  canv.translate(x1, y1);
  canv.rotate(Math.atan2(a, o));
  canv.translate(-bx, -by * ih);
  canv.scale(bx + br + hypot(o, a), ih);
  img.draw(canv);
  if (box) {
    canv.strokeStyle = "purple";
    canv.lineWidth = 0.02;
    canv.strokeRect(0, 0, 1, 1);
  }
  canv.restore();
}

function limb(cwInner, fstParams, sndParams) {
  return function(canv, fstImg, x1, y1, sndImg, x2, y2) {
    var dist = hypot(x2 - x1, y2 - y1);
    var fstLen = fstParams.length,
      sndLen = sndParams.length;

    var prod =
      (dist + fstLen + sndLen) *
      (dist - fstLen + sndLen) *
      (dist + fstLen - sndLen) *
      (-dist + fstLen + sndLen);
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var jointangle = 0;
    if (prod >= 0 && dist < fstLen + sndLen) {
      // law of sines
      var circumr = dist * fstLen * sndLen / Math.sqrt(prod);
      jointangle = Math.asin(sndLen / (2 * circumr));
    } else fstLen = fstLen / (fstLen + sndLen) * dist;

    if (cwInner) jointangle *= -1;

    var jointx = x1 + fstLen * Math.cos(angle + jointangle);
    var jointy = y1 + fstLen * Math.sin(angle + jointangle);

    skewimage(
      canv,
      fstImg,
      fstParams.bx,
      fstParams.by,
      fstParams.br,
      fstParams.ih,
      jointx,
      jointy,
      x1,
      y1
    );
    skewimage(
      canv,
      sndImg,
      sndParams.bx,
      sndParams.by,
      sndParams.br,
      sndParams.ih,
      x2,
      y2,
      jointx,
      jointy
    );
  };
}

var legLimb = limb(
  false,
  {
    length: 26.25 / 48,
    bx: 0,
    by: 0.6,
    br: 6 / 48,
    ih: 39.4 / 48 / 3
  },
  {
    length: 1 - 26.25 / 48,
    bx: 5 / 48 / 3,
    by: 0.45,
    br: 4 / 48,
    ih: 60 / 48 / 3
  }
);

var armLimb = limb(
  true,
  {
    length: 0.3234,
    bx: 12.2 / 48 / 3,
    by: 0.5,
    br: 13 / 48 / 3,
    ih: -32 / 48 / 3
  },
  {
    length: 0.3444,
    bx: 3 / 48,
    by: 0.5,
    br: 13.2 / 48 / 3,
    ih: 22.8 / 48 / 3
  }
);

function wheel(canv, lgr, wheelX, wheelY, wheelR) {
  canv.save();
  canv.translate(wheelX, -wheelY);
  canv.rotate(-wheelR);
  canv.scale(38.4 / 48, 38.4 / 48);
  canv.translate(-0.5, -0.5);
  lgr.wheel.draw(canv);
  canv.restore();
}

function turnScale(x) {
  return -Math.cos(x * Math.PI);
}

const defaultBikeCoords = {
  bikeR: 10000,
  turn: 0,
  leftX: -849.4,
  leftY: -600.6,
  rightX: 849,
  rightY: -600,
  rightR: 0.42,
  headX: 0,
  headY: 439,
  lastTurnF: -1,
  lv: null,
};

// extracted from recRender so we can draw a bike in start position when there's no replay
export default function bikeRender(canv, lgr, shirt, frame, x, y, scale, startX, startY, bikeCoords) {
  canv.save();
  canv.translate(
    scale * (-x + startX),
    scale * (-y - startY)
  );
  canv.scale(scale, scale);
  canv.beginPath();

  var coords = bikeCoords ? bikeCoords : defaultBikeCoords;

  var bikeR = coords.bikeR * Math.PI * 2 / 10000;
  var turn = coords.turn;
  var leftX = coords.leftX / 1000;
  var leftY = coords.leftY / 1000;
  var leftR = coords.leftR * Math.PI * 2 / 250;
  var rightX = coords.rightX / 1000;
  var rightY = coords.rightY / 1000;
  var rightR = coords.rightR * Math.PI * 2 / 250;
  var headX = coords.headX / 1000;
  var headY = coords.headY / 1000;
  var lastTurnF = coords.lastTurnF;
  var lv = coords.lv;

  var animlen = 28;
  var animpos =
    lv != null && frame - lv[0] < animlen ? (frame - lv[0]) / animlen : 0;
  var turnpos =
    lastTurnF >= 0 && lastTurnF + 24 > frame ? (frame - lastTurnF) / 24 : 0;

  var backX = !turn ? rightX : leftX;
  var backY = !turn ? rightY : leftY;
  var backR = !turn ? rightR : leftR;
  var frontX = turn ? rightX : leftX;
  var frontY = turn ? rightY : leftY;
  var frontR = turn ? rightR : leftR;

  if (turnpos == 0 || turnpos > 0.5) wheel(canv, lgr, backX, backY, backR);
  if (turnpos <= 0.5) wheel(canv, lgr, frontX, frontY, frontR);

  canv.save();
  canv.rotate(-bikeR);
  if (turn) canv.scale(-1, 1);
  if (turnpos > 0) canv.scale(turnScale(turnpos), 1);

  var wx, wy, a, r;
  var hbarsX = -21.5,
    hbarsY = -17;
  canv.save();
  canv.scale(1 / 48, 1 / 48);

  // front suspension
  wx = turn ? rightX : leftX;
  wy = turn ? -rightY : -leftY;
  a = Math.atan2(wy, (turn ? -1 : 1) * wx) + (turn ? -1 : 1) * bikeR;
  r = hypot(wx, wy);
  skewimage(
    canv,
    lgr.susp1,
    2,
    0.5,
    5,
    6,
    48 * r * Math.cos(a),
    48 * r * Math.sin(a),
    hbarsX,
    hbarsY
  );

  // rear suspension
  wx = turn ? leftX : rightX;
  wy = turn ? -leftY : -rightY;
  a = Math.atan2(wy, (turn ? -1 : 1) * wx) + (turn ? -1 : 1) * bikeR;
  r = hypot(wx, wy);
  //skewimage(canv, lgr.susp2, 5, 0.5, 5, 6.5, 48*r*Math.cos(a), 48*r*Math.sin(a), 10, 20);
  skewimage(
    canv,
    lgr.susp2,
    0,
    0.5,
    5,
    6,
    9,
    20,
    48 * r * Math.cos(a),
    48 * r * Math.sin(a)
  );
  canv.restore();

  canv.save(); // bike
  canv.translate(-43 / 48, -12 / 48);
  canv.rotate(-Math.PI * 0.197);
  canv.scale(0.215815 * 380 / 48, 0.215815 * 301 / 48);
  lgr.bike.draw(canv);
  canv.restore();

  canv.save(); // kuski
  r = hypot(headX, headY);
  a = Math.atan2(-headY, turn ? -headX : headX) + (turn ? -bikeR : bikeR);
  wx = r * Math.cos(a);
  wy = r * Math.sin(a);
  canv.translate(wx, wy);

  canv.save(); // head
  canv.translate(-15.5 / 48, -42 / 48);
  canv.scale(23 / 48, 23 / 48);
  lgr.head.draw(canv);
  canv.restore();

  var bumx = 19.5 / 48,
    bumy = 0;
  var pedalx = -wx + 10.2 / 48 / 3,
    pedaly = -wy + 65 / 48 / 3;
  legLimb(canv, lgr.q1thigh, bumx, bumy, lgr.q1leg, pedalx, pedaly);

  canv.save(); // torso
  canv.translate(17 / 48, 9.25 / 48);
  canv.rotate(Math.PI + 2 / 3);
  canv.scale(100 / 48 / 3, 58 / 48 / 3);
  if (shirt && shirt.touch()) {
    // assumes shirts are rotated as on EOL site
    canv.translate(0.5, 0.5);
    canv.rotate(Math.PI / 2);
    canv.translate(-0.5, -0.5);
    shirt.draw(canv);
  } else lgr.q1body.draw(canv);
  canv.restore();

  var shoulderx = 0 / 48,
    shouldery = -17.5 / 48;
  var handlex = -wx - 64.5 / 48 / 3,
    handley = -wy - 59.6 / 48 / 3;
  var handx = handlex,
    handy = handley;

  var animx = shoulderx,
    animy = shouldery;
  if (animpos > 0) {
    var dangle, ascale;
    if (lv[1] == turn) {
      if (animpos >= 0.25) animpos = 0.25 - 0.25 * (animpos - 0.25) / 0.75;
      dangle = 10.8 * animpos;
      ascale = 1 - 1.2 * animpos;
    } else {
      if (animpos >= 0.2) animpos = 0.2 - 0.2 * (animpos - 0.2) / 0.8;
      dangle = -8 * animpos;
      ascale = 1 + 0.75 * animpos;
    }
    var at = Math.atan2(handley - animy, handlex - animx) + dangle;
    var dist = ascale * hypot(handley - animy, handlex - animx);
    handx = animx + dist * Math.cos(at);
    handy = animy + dist * Math.sin(at);
  }

  armLimb(
    canv,
    lgr.q1up_arm,
    shoulderx,
    shouldery,
    lgr.q1forarm,
    handx,
    handy
  );
  canv.restore();
  canv.restore();

  if (turnpos != 0 && turnpos <= 0.5) wheel(canv, lgr, backX, backY, backR);
  if (turnpos > 0.5) wheel(canv, lgr, frontX, frontY, frontR);
  canv.restore();
}