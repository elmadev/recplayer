// crude way to get files as binary strings, compatible with binReader.js
export const getString = function(url, fn) {
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4)
      fn(
        xhr.responseText
          .split("")
          .map(function(c) {
            return String.fromCharCode(c.charCodeAt(0) & 0xff);
          })
          .join("")
      );
  };
  xhr.open("GET", url);
  xhr.overrideMimeType("text/plain; charset=x-user-defined");
  xhr.send(null);
}

// more modern Uint8Array
export const getArray = function (url, fn) {
  var xhr = new XMLHttpRequest();
  xhr.responseType = "arraybuffer";

  xhr.onload = function () {
    if (xhr.status === 200) {
      fn(new Uint8Array(xhr.response));
    }
  };

  xhr.open("GET", url);
  xhr.send();
}