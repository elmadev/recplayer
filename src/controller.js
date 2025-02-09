import levReader from "./levReader";
import recReader from "./recReader";
import {getString, getArray} from "./get";
import { LGRWrapper, UrlImage } from "./lgr";
import player from "./player";

/**
 * @param {Object} arguments
 * @param {string} arguments.levelUrl - Url path to the level file
 * @param {HTMLElement} arguments.elem - <div> element which to attach the recplayer
 * @param {Document} arguments.document - document node of the webpage
 * @param {Function} arguments.onFrameUpdate - function to call when a new frame is drawn
 * @param {boolean} arguments.autoPlay - whether to automatically start the replay
 * @param {string} arguments.lgrFrom - 'file', 'level', 'legacy'
 * 'file': use a direct lgr filepath e.g. lgrUrl = 'http://api.elma.online/api/lgr/get/default'
 * 'level': determine the lgr from the level file e.g. lgrUrl = 'http://api.elma.online/api/lgr/get/'
 * 'legacy': use legacy .png images e.g. legacy_url = 'https://api.elma.online/recplayer'
 * @param {string} arguments.lgrUrl - Contains a path to lgr resources based on the parameter lgrFrom
 * @param {string} arguments.defaultLgrUrl - Backup lgr if unable to load main lgr e.g. 'http://api.elma.online/api/lgr/get/default'
 * @param {string} arguments.legacy_url - Contains a path to png lgr resources if the parameter lgrFrom is 'legacy'
 */
export default function(_args) {
  let args = _args
  // Handle legacy arguments for backwards-compatibility:
  // controller(levelName, imagesPath, elem, document, onFrameUpdate, autoPlay)
  if(arguments.length > 1) {
    args = {
      levelUrl: arguments[0],
      legacy_url: arguments[1],
      elem: arguments[2],
      document: arguments[3],
      onFrameUpdate: arguments[4],
      autoPlay: arguments[5],
      lgrFrom: 'legacy'
    }
  }
  const {levelUrl, elem, document, onFrameUpdate, autoPlay, lgrFrom, lgrUrl, defaultLgrUrl, legacy_url} = args

  var createElement =
    "createElementNS" in document
      ? function(tag) {
          return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
        }
      : function(tag) {
          return document.createElement(tag);
        };

  function mkCanv(w, h) {
    var o = createElement("canvas");
    o.width = w;
    o.height = h;
    return o;
  }

  return function(cont) {
    var canvase = mkCanv(600, 480);
    var canvas = canvase.getContext("2d");
    elem.appendChild(canvase);

    // Try to download the level and lgr at the same time (unless we need to get the lgr name from the level file)
    var pllgr = null;
    var levRd = null;
    const assetLoaded = () => {
      if (pllgr && levRd) {
        setup();
      }
      if (levRd && !pllgr && lgrFrom === 'level') {
        var lgrUrlComplete = `${lgrUrl}${levRd.lgr()}`;
        getLgrFile(lgrUrlComplete)
      }
    }

    getString(levelUrl, function(lev) {
      levRd = levReader(lev)
      assetLoaded();
    });

    const getBackupLgr = (originalUrl) => () => {
      // If we are unsuccessful at downloading the main lgr, try to download default.lgr, or else use legacy png lgr
      console.log(`Recplayer - Unable to load ${originalUrl}, trying to load ${defaultLgrUrl} instead`)
      getArray(defaultLgrUrl, lgrFile => {
        pllgr = new LGRWrapper(lgrFile, undefined);
        assetLoaded();
      }, () => {
        console.log(`Recplayer - Unable to load ${defaultLgrUrl}, using legacy .png files`)
        legacy_getLgr();
      })
    }
    const legacy_getLgr = () => {
      pllgr = new LGRWrapper(null, legacy_url)
      assetLoaded();
    }
    const getLgrFile = (url) => {
      getArray(url, lgrFile => {
        pllgr = new LGRWrapper(lgrFile, undefined);
        assetLoaded();
      }, getBackupLgr(url));
    }
    if (lgrFrom === 'legacy') {
      legacy_getLgr();
    }
    if (lgrFrom === 'file') {
      getLgrFile(lgrUrl);
    }

    const setup = function() {
      var pl = player(levRd, pllgr, mkCanv, autoPlay);

      function listener(e) {
        if (pl.inputKey(e.key)) e.preventDefault();
      }

      canvase.setAttribute("tabindex", "0");
      canvase.addEventListener("keydown", listener, true);
      var play = true;
      var animationLoop;
      var loop =
        typeof requestAnimationFrame != "undefined"
          ? function(fn) {
              void (function go() {
                fn();
                play && requestAnimationFrame(go);
              })();
            }
          : function(fn) {
              var fps = 30;
              animationLoop = setInterval(fn, 1000 / fps);
            };

      function draw() {
        var status = pl.draw(canvas, 0, 0, canvase.width, canvase.height, true);
        status && onFrameUpdate(status.currentFrame, status.maxFrames);
      }
      loop(draw);

      function rect() {
        return canvase.getBoundingClientRect();
      }

      canvase.addEventListener("click", function(e) {
        var r = rect();
        pl.inputClick(
          e.clientX - r.left,
          e.clientY - r.top,
          canvase.width,
          canvase.height
        );
        e.preventDefault();
      });

      canvase.addEventListener("mousedown", function(e) {
        var r = rect();
        var cont = pl.inputDrag(
          e.clientX - r.left,
          e.clientY - r.top,
          canvase.width,
          canvase.height
        );

        function onmousemove(e) {
          cont.update(e.clientX - r.left, e.clientY - r.top);
          e.preventDefault();
        }

        function onmouseup() {
          cont.end();
          // /me dislikes function identity
          document.removeEventListener("mousemove", onmousemove);
          document.removeEventListener("mouseup", onmouseup);
          e.preventDefault();
        }

        document.addEventListener("mousemove", onmousemove);
        document.addEventListener("mouseup", onmouseup);
      });

      canvase.addEventListener("touchstart", function ontouchstart(e) {
        var ts = e.changedTouches;
        var r = rect();

        if (ts.length < 1) return;
        e.preventDefault();

        var cont = pl.inputDrag(
          ts[0].clientX - r.left,
          ts[0].clientY - r.top,
          canvase.width,
          canvase.height
        );

        var isClick = true;

        function ontouchmove(e) {
          var ts = e.changedTouches;
          if (ts.length < 1) return;
          isClick = false;
          cont.update(ts[0].clientX - r.left, ts[0].clientY - r.top);
          e.preventDefault();
        }

        function ontouchend() {
          cont.end();
          if (isClick)
            pl.inputClick(
              ts[0].clientX - r.left,
              ts[0].clientY - r.top,
              canvase.width,
              canvase.height
            );
          // ..
          document.removeEventListener("touchmove", ontouchmove);
          document.removeEventListener("touchend", ontouchend);
          document.removeEventListener("touchcancel", ontouchend);

          canvase.addEventListener("touchstart", ontouchstart);
        }

        document.addEventListener("touchmove", ontouchmove);
        document.addEventListener("touchend", ontouchend);
        document.addEventListener("touchcancel", ontouchend);

        canvase.removeEventListener("touchstart", ontouchstart);
      });

      canvase.addEventListener("wheel", function(e) {
        var r = rect();
        var delta =
          e.deltaMode == WheelEvent.DOM_DELTA_LINE
            ? (53 / 3) * e.deltaY
            : e.deltaY;
        pl.inputWheel(
          e.clientX - r.left,
          e.clientY - r.top,
          canvase.width,
          canvase.height,
          delta
        );
        e.preventDefault();
      });

      cont({
        loadReplay: function(recName, shirts) {
          getString(recName, function(rec) {
            if (rec) {
              pl.addReplay(
                recReader(rec),
                !shirts
                  ? []
                  : shirts.map(function(s) {
                      return s == null ? null : new UrlImage(pllgr, '', s);
                    })
              );
            }
          });
        },

        loadReplays: function(recNames, shirts) {
          let loadedShirt = !shirts
            ? []
            : shirts.map(function(s) {
                return s == null ? null : new UrlImage(pllgr, '', s);
              });

          recNames.map(function(r) {
            return getString(r, function(rec) {
              pl.addReplay(recReader(rec), r, [loadedShirt[0]]);
              loadedShirt = loadedShirt.slice(1);
            });
          });
        },

        changeReplays: function(recNames, shirts) {
          const loadedRecs = pl.loadedRecs();

          loadedRecs.forEach(function(r) {
            if (!recNames.includes(r)) {
              pl.removeReplay(r);
            }
          });

          const newRecs = [];
          const newShirts = [];

          recNames.forEach(function(r, i) {
            if (loadedRecs.includes(r)) {
              return;
            }

            newRecs.push(r);
            newShirts.push(shirts[i]);
          });

          let loadedShirt = newShirts.map(function(s) {
            return s == null ? null : new UrlImage(pllgr, '', s);
          });

          newRecs.map(function(r) {
            return getString(r, function(rec) {
              pl.addReplay(recReader(rec), r, [loadedShirt[0]]);
              loadedShirt = loadedShirt.slice(1);
            });
          });
        },

        removeAnimationLoop: function() {
          play = false;
          animationLoop && window.clearInterval(animationLoop);
        },

        loadLevel: function(levelUrl, cont) {
          getString(levelUrl, function(lev) {
            pl.changeLevel(levReader(lev));
            if (cont) cont();
          });
        },

        resize: function(wd, ht) {
          canvase.width = wd;
          canvase.height = ht;
          pl.invalidate();
        },

        setFrame: function(frame) {
          pl.setFrame(frame);
        },

        player: function() {
          return pl;
        },
      });
    }
  };
}
