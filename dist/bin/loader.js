/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ({

/***/ 0:
/***/ function(module, exports, __webpack_require__) {

	'use strict';

	var back = __webpack_require__(260);
	var splash = window.splash = $('<div/>');
	splash.width($(window).width());
	splash.height($(window).height());
	splash.css('background-color', '#fff');
	splash.css('text-align', 'center');
	splash.css('display', 'table-cell');
	splash.css('vertical-align', 'middle');
	$('body').append(splash);
	var inner = $('<img src="' + back + '"/>');
	if (inner[0].width > splash[0].clientWidth) {
		splash.css('background-image', 'url("' + back + '")');
		splash.css('background-position', 'center');
		splash.css('background-size', inner.width + 'px');
	} else {
		inner.css('width', '80%');
		splash.append(inner);
	}

	var loadScript = window.loadScript = function (src, callback) {
		jQuery.ajax({
			crossDomain: true,
			dataType: "script",
			url: src,
			cache: true,
			success: function success() {
				typeof callback === 'function' && callback();
			},
			error: function error(e) {
				typeof callback === 'function' && callback(e);
			}
		});
	};
	$.get('manifest.json?t=' + new Date().getTime(), function (data) {
		loadScript(data['entry.js']);
	}, 'json');

/***/ },

/***/ 260:
/***/ function(module, exports, __webpack_require__) {

	module.exports = __webpack_require__.p + "company.jpg?dc7343d4519459a6151e805f84d6471f";

/***/ }

/******/ });