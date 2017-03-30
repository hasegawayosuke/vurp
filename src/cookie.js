"use strict";

const resCookie = require("set-cookie-parser"),
	  reqCookie = require("cookie"),
	  util = require("util");

let _originalFromAlt = {};
let _altFromOriginal = {};

function serializeSetCookie(cookies){
	let r = [];
	const serializeCookie = function(cookie){
		let re = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
		let r = "";

		if (!re.test(cookie.name)) {
			throw new TypeError("invalid name");
		}
		let v = encodeURIComponent(cookie.value);
		if (!re.test(v)) {
			throw new TypeError("invalid value");
		}
		r = `${cookie.name}=${v}`;
		if (cookie.maxAge) {
			r += `; max-age=${cookie.maxAge|0}`;
		}
		if (cookie.domain && re.test(cookie.domain)) {
			r += `; domain=${cookie.domain}`;
		}
		if (cookie.path && re.test(cookie.path)) {
			r += `; path=${cookie.path}`;
		}
		if (cookie.expires && typeof cookie.expires.toUTCString === "function") {
			r += `; expires=${cookie.expires.toUTCString()}`;
		}
		if (cookie.httpOnly||cookie.httponly) {
			r += "; httponly";
		}
		if (cookie.secure) {
			r += "; secure";
		}
		if (cookie.sameSite||cookie.samesite) {
			let s = cookie.sameSite || cookie.samesite;
			if (typeof s === "string") s = s.toLowerCase();
			if (s === true) {
				r += "; SameSite=strict";
			} else if (s === "strict") {
				r += "; SameSite=strict";
			} else if (s === "lax") {
				r += "; SameSite=lax";
			} 
		}
		return r;
	};
	if (Array.isArray(cookies)) {
		cookies.forEach(cookie => r.push(serializeCookie(cookie)));
	} else {
		r.push(serializeCookie(cookies));
	}
	return r;
}

function serializeCookie(cookieObj){
	let s = "";
	let v;
	for (let name in cookieObj) {
		v = encodeURIComponent(cookieObj[name]);
		if (s !== "") s += "; ";
		s += `${name}=${v}`;
	}
	return s;
}

// return "Cookie:" request string
function revertSession(cookieHeaderString, cookieName) {
	let cookies = reqCookie.parse(cookieHeaderString);
	let altFromBrowser = cookies[cookieName];
	let result = {};

	if (altFromBrowser !== undefined) {
		result.alternate = altFromBrowser;
		if (_originalFromAlt[cookieName] !== undefined) {
			let original = _originalFromAlt[cookieName][altFromBrowser];
			if (original !== undefined) {
				result.original = original;
				cookies[cookieName] = original;
			}
		}
	}
	return serializeCookie(cookies);
	result.text = serializeCookie(cookies);
	return result;
}

// return "Set-Cookie:" response cookie object
// TODO: expires で古いCookieを消す。ガベコレ。
function regenerateSession(cookieHeaderString, parsedSetCookie, cookieName, regenerator) {
	let parsedCookie = reqCookie.parse(cookieHeaderString); // request "Cookie" header
	let result;
	parsedSetCookie.forEach( setCookie => {
		let altNew, altOld, orgNew, orgOld;
		if (setCookie.name !== cookieName) return;
		if (_altFromOriginal[cookieName] === undefined) _altFromOriginal[cookieName] = {};
		if (_originalFromAlt[cookieName] === undefined) _originalFromAlt[cookieName] = {};
		orgOld = parsedCookie[cookieName];
		orgNew = setCookie.value;
		if (orgOld) altOld = _altFromOriginal[cookieName][orgOld];
		if (orgOld !== orgNew) {
			// regenerate
			let altNew = regenerator();
			if (orgOld !== undefined) {
				 delete _altFromOriginal[cookieName][orgOld];
			}
			if (altOld !== undefined) {
				delete _originalFromAlt[cookieName][altOld];
			}
			altNew = regenerator();
			_altFromOriginal[cookieName][orgNew] = altNew;
			_originalFromAlt[cookieName][altNew] = orgNew;
		}
		setCookie.value = _altFromOriginal[cookieName][orgNew];
		result = parsedSetCookie;
	});
	return result;
}


/*
function revertCookie(cookieString, targetName){
	let cookies = reqCookie.parse(cookies);
	let altFromBrowser = cookies[targetName];
	let result = {};
	if (altFromBrowser !== undefined) {
		result.alternate = altFromBrowser;
		if (_cookieStore[targetName] !== undefined) {
			let original = _cookieStore[targetName][altFromBrowser];
			if (original !== undefined) {
				result.original = original;
				cookies[targetName] = original;
			}
		}
	}
	result.text = reqCookie.serialize(cookies);
	return result;
}

function regenerateCookie(cookies, targetName, regenerator){
	if (!Array.isArray(cookies)) cookies = [cookies];
	cookies.forEach(cookie => {
		if (cookie.name === targetName) {
			if (_cookieStore[targetName] === undefined) {
				_cookieStore[targetName] = {};
			}
			let original = cookie.value;
			let alternate = regenerator();
			_cookieStore[targetName][alternate] = original;
		}
	});
	return cookies;
}
*/

exports.parseSetCookie = resCookie.parse;
exports.parseCookie = reqCookie.parse;
exports.serializeSetCookie = serializeSetCookie;
exports.serializeCookie = reqCookie.serialize;
exports.revertSession = revertSession;
exports.regenerateSession = regenerateSession;

/*
exports.revert = revertCookie;
exports.regenerate = regenerateCookie;

*/
