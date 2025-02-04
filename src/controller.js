import levReader from "./levReader";
import recReader from "./recReader";
import {getString, getArray} from "./get";
import lgr from "./lgr";
import player from "./player";

export default function(
  levName,
  resourcePath,
  elem,
  document,
  onFrameUpdate,
  autoPlay,
  lgrOverride = '_legacy',
) {
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

    getString(levName, function(lev) {
      var levRd = levReader(lev)
      const setup = function(lgrFile) {
        var pllgr = lgr(
          lgrFile,
          resourcePath,
          function() {
            return createElement("img");
          },
          mkCanv
        );
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
                        return s == null ? null : pllgr.img_lazy(s);
                      })
                );
              }
            });
          },

          loadReplays: function(recNames, shirts) {
            let loadedShirt = !shirts
              ? []
              : shirts.map(function(s) {
                  return s == null ? null : pllgr.img_lazy(s);
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
              return s == null ? null : pllgr.img_lazy(s);
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

          loadLevel: function(levName, cont) {
            getString(levName, function(lev) {
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
      var lgrName = lgrOverride || levRd.lgr()
      if (lgrName !== '_legacy') {
        var lgrGet = `${resourcePath}${lgrName}`
        getArray(lgrGet, setup)
      } else {
        setup(null)
      }
    });
  };
}
