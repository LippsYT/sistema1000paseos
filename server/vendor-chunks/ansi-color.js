/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/ansi-color";
exports.ids = ["vendor-chunks/ansi-color"];
exports.modules = {

/***/ "(action-browser)/./node_modules/ansi-color/lib/ansi-color.js":
/*!***************************************************!*\
  !*** ./node_modules/ansi-color/lib/ansi-color.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("// ANSI color code outputs for strings\n\nvar ANSI_CODES = {\n  \"off\": 0,\n  \"bold\": 1,\n  \"italic\": 3,\n  \"underline\": 4,\n  \"blink\": 5,\n  \"inverse\": 7,\n  \"hidden\": 8,\n  \"black\": 30,\n  \"red\": 31,\n  \"green\": 32,\n  \"yellow\": 33,\n  \"blue\": 34,\n  \"magenta\": 35,\n  \"cyan\": 36,\n  \"white\": 37,\n  \"black_bg\": 40,\n  \"red_bg\": 41,\n  \"green_bg\": 42,\n  \"yellow_bg\": 43,\n  \"blue_bg\": 44,\n  \"magenta_bg\": 45,\n  \"cyan_bg\": 46,\n  \"white_bg\": 47\n};\n\nexports.set = function(str, color) {\n  if(!color) return str;\n\n  var color_attrs = color.split(\"+\");\n  var ansi_str = \"\";\n  for(var i=0, attr; attr = color_attrs[i]; i++) {\n    ansi_str += \"\\033[\" + ANSI_CODES[attr] + \"m\";\n  }\n  ansi_str += str + \"\\033[\" + ANSI_CODES[\"off\"] + \"m\";\n  return ansi_str;\n};//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFjdGlvbi1icm93c2VyKS8uL25vZGVfbW9kdWxlcy9hbnNpLWNvbG9yL2xpYi9hbnNpLWNvbG9yLmpzIiwibWFwcGluZ3MiOiJBQUFBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLFdBQVc7QUFDWDs7QUFFQTtBQUNBO0FBQ0EscUJBQXFCLHVCQUF1QjtBQUM1QztBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vbmV4dG4vLi9ub2RlX21vZHVsZXMvYW5zaS1jb2xvci9saWIvYW5zaS1jb2xvci5qcz80M2NmIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEFOU0kgY29sb3IgY29kZSBvdXRwdXRzIGZvciBzdHJpbmdzXG5cbnZhciBBTlNJX0NPREVTID0ge1xuICBcIm9mZlwiOiAwLFxuICBcImJvbGRcIjogMSxcbiAgXCJpdGFsaWNcIjogMyxcbiAgXCJ1bmRlcmxpbmVcIjogNCxcbiAgXCJibGlua1wiOiA1LFxuICBcImludmVyc2VcIjogNyxcbiAgXCJoaWRkZW5cIjogOCxcbiAgXCJibGFja1wiOiAzMCxcbiAgXCJyZWRcIjogMzEsXG4gIFwiZ3JlZW5cIjogMzIsXG4gIFwieWVsbG93XCI6IDMzLFxuICBcImJsdWVcIjogMzQsXG4gIFwibWFnZW50YVwiOiAzNSxcbiAgXCJjeWFuXCI6IDM2LFxuICBcIndoaXRlXCI6IDM3LFxuICBcImJsYWNrX2JnXCI6IDQwLFxuICBcInJlZF9iZ1wiOiA0MSxcbiAgXCJncmVlbl9iZ1wiOiA0MixcbiAgXCJ5ZWxsb3dfYmdcIjogNDMsXG4gIFwiYmx1ZV9iZ1wiOiA0NCxcbiAgXCJtYWdlbnRhX2JnXCI6IDQ1LFxuICBcImN5YW5fYmdcIjogNDYsXG4gIFwid2hpdGVfYmdcIjogNDdcbn07XG5cbmV4cG9ydHMuc2V0ID0gZnVuY3Rpb24oc3RyLCBjb2xvcikge1xuICBpZighY29sb3IpIHJldHVybiBzdHI7XG5cbiAgdmFyIGNvbG9yX2F0dHJzID0gY29sb3Iuc3BsaXQoXCIrXCIpO1xuICB2YXIgYW5zaV9zdHIgPSBcIlwiO1xuICBmb3IodmFyIGk9MCwgYXR0cjsgYXR0ciA9IGNvbG9yX2F0dHJzW2ldOyBpKyspIHtcbiAgICBhbnNpX3N0ciArPSBcIlxcMDMzW1wiICsgQU5TSV9DT0RFU1thdHRyXSArIFwibVwiO1xuICB9XG4gIGFuc2lfc3RyICs9IHN0ciArIFwiXFwwMzNbXCIgKyBBTlNJX0NPREVTW1wib2ZmXCJdICsgXCJtXCI7XG4gIHJldHVybiBhbnNpX3N0cjtcbn07Il0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(action-browser)/./node_modules/ansi-color/lib/ansi-color.js\n");

/***/ })

};
;