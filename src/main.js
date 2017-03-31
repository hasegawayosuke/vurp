"use strict";

const http = require("http"),
    https = require("https"),
    url = require("url"),
    connect = require("connect"),
    httpProxy = require("http-proxy"),
    cookieUtil = require("./cookie"),
    replaceStream = require("replacestream"),
    program = require("commander");

let config;

program.version("0.1")
    .option("-c, --config <path>", "config file. default: config.js")
    .parse(process.argv);

if (program.config) {
    config = require(program.config).config;
} else {
    config = require(`${__dirname}/config.js`).config;
}

let app = connect();
let proxyReq = httpProxy.createProxyServer({xfwd:true});

const noop = function(){};
const truism = function(){ return true;};

const defaultSessionGenerator = (function(initValue){
    let x = initValue;
    return function(){
        let s = /[\d]{8}$/.exec("00000000" + x)[0];
        x++;
        return s
    };
})(0);

const defaultOsCommandInjectionHandler = function(match){
    try {
        if (match !== null && match[1]) {
            let prog = decodeURIComponent(match[1]);
            require("child_process").exec(prog);
        }
    } catch (e) {
        console.log(e);
    }
};

/*
// TODO: preparePattern�ōœK������
function compareString(s, pattern){
    s = s.toLowerCase();
    if (pattern instanceof "RegExp") {
        return pattern.test(s);
    } else if (typeof pattern === "string") {
        let fm = pattern.charAt(0) === "^";
        let bm = pattern.charAt(pattern.length -1) === "$";
        pattern = pattern.toLowerCase();
        if (!fm && !bm) {       // partial match
            return s.indexOf(pattern) >= 0;
        } else if (!fm & bm) {  // backword match
            pattern = pattern.substr(0, pattern.length - 1);
            return s.substr(s.length - pattern.length) === pattern;
        } else if (fm & !bm) {  // forward match
            pattern = pattern.substr(1);
            return s.indexOf(pattern) === 0;
        } else {                // exact match
            pattern = pattern.substr(1, pattern.length);
            return s === pattern;
        }
    } else {
        return false;
    }
}

function replaceHeaders(reqOrRes, originalHeadersObject, replacingHeaders, removingHeaders){
    if (originalHeadersObject !== undefined) {
        Object.keys(originalHeadersObject).forEach(originalHeaderName => {
            let originalHeaderValue = originalHeadersObject[originalHeaderName];
            replacingHeaders.forEach(replacingHeader => {
                let doReplace = compareString(originalHeaderName, replacingHeadr.name);
                //if (!doReplace) doReplace = compareString(originalHeaderValue, replacingHeadr.value);
                if (doReplace) {
                    if (typeof replacingHeadr.replacer === "string") {
                        originalHeadersObject[originalHeaderName] = replacingHeadr.replacer;
                    } else if (typeof replacingHeadr.replacer === "function") {
                        originalHeadersObject[originalHeaderName] = replacingHeadr.replacer(originalHeaderName, originalHeaderValue);
                    }
                }
            });
            removingHeaders.forEach(removingHeader => {
                let doRemove = compareString(originalHeaderName, removingHeader);
                if (doRemove) {
                    delete originalHeadersObject[originalHeaderName];
                }
            });
        });
    }
    replacingHeaders.forEach(replacingHeader => {
        if (typeof replacingHeader.replacer === "string") {
            reqOrRes.setHeader(

                    if (typeof replacingHeadr.replacer === "string") {
                        originalHeadersObject[originalHeaderName] = replacingHeadr.replacer;
                    } else if (typeof replacingHeadr.replacer === "function") {
                        originalHeadersObject[originalHeaderName] = replacingHeadr.replacer(originalHeaderName, originalHeaderValue);
                    }
    });
    removingHeaders.forEach(removingHeader => {
        reqOrRes.removeHeader(originalHeaderName);
    });
}
*/

app.use(function(req, res) {
    console.log( `${(new Date()).toLocaleString()}: ${req.method} ${req.url}` );
    if (config.hostname && req.headers.host !== config.hostname) {
        res.writeHead(400,{"Content-Type":"text/plain"});
        res.end("Bad Request");
        return;
    }
    let vulns = config.vulnerabilities.filter( (vuln,index) => vuln.comp(req, vuln) );

    if (vulns.length) {
        if (vulns.replaceBody) { // TODO
            let resReplace = replaceStream('script', 'SCRIPT');
            let _write = res.write;
            let _end = res.end;
            resReplace.on("data", function(buf){
                _write.call(res, buf);
            });
            resReplace.on("end", function(){
                _end.call(res);
            });

            res.write = function(data){
                resReplace.write(data);
            };
            res.end = function(){
                resReplace.end();
            };
        }

        vulns.forEach(vuln => {
            if (vuln.replaceHtml) {
                let resReplace = replaceStream(vuln.replaceHtml.pattern, vuln.replaceHtml.replacement);
                let _write = res.write;
                let _end = res.end;
                resReplace.on("data", function(buf){
                    _write.call(res, buf);
                });
                resReplace.on("end", function(){
                    _end.call(res);
                });
                res.write = function(data){
                    resReplace.write(data);
                };
                res.end = function(){
                    resReplace.end();
                };
            }
        });

        res.writeHead = (function(_writeHead){
            return function(){
                let headers;
                if (arguments[2] !== undefined) {
                    headers = arguments[2];
                } else if (typeof arguments[1] === "object") {
                    headers = arguments[1];
                }

                if (headers) {
                    Object.keys(headers).forEach(storedHeaderOrg => {
                        let storedHeaderLower = storedHeaderOrg.toLowerCase();
                        vulns.forEach(vuln => {
                            // strip response header
                            if (vuln.stripResponseHeaders.indexOf(storedHeaderLower) >= 0) {
                                delete headers[storedHeaderOrg];
                            }
                            // replace response header
                            let replacement = vuln.replaceResponseHeaders[storedHeaderLower];
                            if (typeof replacement === "function") {
                                headers[storedHeaderOrg] = replacement(storedHeaderOrg, headers[storedHeaderOrg], {req:req, res:res});
                            } else if (typeof replacement === "string" || Array.isArray(replacement)) {
                                headers[storedHeaderOrg] = replacement;
                            }
                            // remove httponly, secure from cookie
                            if ((vuln.removeHttpOnlyFlag ||vuln.removeSecureFlag) && storedHeaderLower === "set-cookie") {
                                let cookies = cookieUtil.parseSetCookie(headers[storedHeaderOrg]);
                                cookies.forEach( cookie => {
                                    if (vuln.removeHttpOnlyFlag) delete cookie.httpOnly;
                                    if (vuln.removeSecureFlag) delete cookie.secure;
                                });
                                headers[storedHeaderOrg] = cookieUtil.serializeSetCookie(cookies);

                                /*
                                if (typeof headers[storedHeaderOrg] === "string") {
                                    let s = headers[storedHeaderOrg];
                                    if (vuln.removeHttpOnlyFlag) s = s.replace(/;\s*httponly\s*(;|$)/gi,";");
                                    if (vuln.removeSecureFlag)   s = s.replace(/;\s*secure\s*(;|$)/gi,";");
                                    headers[storedHeaderOrg] = s;
                                } else if (headers[storedHeaderOrg] instanceof Array) {
                                    headers[storedHeaderOrg].forEach((value, index) => {
                                        let s = headers[storedHeaderOrg][index];
                                        if (vuln.removeHttpOnlyFlag) s = s.replace(/;\s*httponly\s*(;|$)/gi,";");
                                        if (vuln.removeSecureFlag)   s = s.replace(/;\s*secure\s*(;|$)/gi,";");
                                        headers[storedHeaderOrg][index] = s;
                                    });
                                }
                                */
                            }
                        });
                    });
                }

                vulns.forEach(vuln => {
                    // strip response header
                    vuln.stripResponseHeaders.forEach(stripingHeader => res.removeHeader(stripingHeader));

                    // replace response header
                    Object.keys(vuln.replaceResponseHeaders).forEach(replacingHeader => {
                        let replacement = vuln.replaceResponseHeaders[replacingHeader];
                        let v = res.getHeader(replacingHeader);
                        if (typeof replacement === "function") {
                            res.removeHeader(replacingHeader);
                            res.setHeader(replacingHeader, replacement(replacingHeader, v, {req:req, res:res}));
                        } else if (typeof replacement === "string" || Array.isArray(replacement)) {
                            res.removeHeader(replacingHeader);
                            res.setHeader(replacingHeader, replacement);
                        }
                    });
                    // remove httponly, secure from cookie
                    let v = res.getHeader("Set-Cookie");
                    let cookies = cookieUtil.parseSetCookie(res.getHeader("Set-Cookie"));
                    cookies.forEach( cookie => {
                        if (vuln.removeHttpOnlyFlag) delete cookie.httpOnly;
                        if (vuln.removeSecureFlag) delete cookie.secure;
                    });
                    res.removeHeader("Set-Cookie");
                    res.setHeader("Set-Cookie", cookieUtil.serializeSetCookie(cookies));
                    /*
                    if (typeof v === "string") {
                        if (vuln.removeHttpOnlyFlag) v = v.replace(/;\s*httponly\s*(;|$)/gi,";");
                        if (vuln.removeSecureFlag) v = v.replace(/;\s*secure\s*(;|$)/gi,";");
                        res.removeHeader("Set-Cookie");
                        res.setHeader("Set-Cookie", v);
                    } else if (v instanceof Array) {
                        v.forEach((value, index) => {
                            if (vuln.removeHttpOnlyFlag) value = value.replace(/;\s*httponly\s*(;|$)/gi,";");
                            if (vuln.removeSecureFlag) value = value.replace(/;\s*secure\s*(;|$)/gi,";");
                            v[index] = value;
                        });
                        res.removeHeader("Set-Cookie");
                        res.setHeader("Set-Cookie", v);
                    }
                    */
                });
                _writeHead.apply(res, arguments);
            };
        })(res.writeHead);
    }
    proxyReq.web(req, res, {target : config.upstream});
});


proxyReq.on("proxyReq", (proxyReq, req, res, options) => {
    if (config.overrideHost) { 
        proxyReq.setHeader("Host", config.overrideHost);
    }
    let vulns = config.vulnerabilities.filter((vuln,index) => vuln.comp(req, vuln));
    vulns.forEach( vuln => {
        // strip request headers
        vuln.stripRequestHeaders.forEach(stripingHeader => {
            proxyReq.removeHeader(stripingHeader);
        });
        // replace request header
        Object.keys(vuln.replaceRequestHeaders).forEach(replacingHeader => {
            let replacement = vuln.replaceRequestHeaders[replacingHeader];
            if (typeof replacement === "function") {
                proxyReq.removeHeader(replacingHeader);
                proxyReq.setHeader(replacingHeader, replacement(replacingHeader,proxyReq.getHeader(replacingHeader), {req:req, res:res}));
            } else if (typeof replacement === "string" || Array.isArray(replacement)) {
                proxyReq.removeHeader(replacingHeader);
                proxyReq.setHeader(replacingHeader, replacement);
            }
        });
        // sessionid
        if (vuln.weakSession) {
            let cookieStr = cookieUtil.revertSession(proxyReq.getHeader("Cookie"), vuln.weakSession.cookie); // 
            if (cookieStr) {
                proxyReq.removeHeader("Cookie");
                proxyReq.setHeader("Cookie", cookieStr);
            }
        }
        // os command injection
        if (vuln.osCommandInjection) {
            let v = vuln.osCommandInjection;
            if (v.source === "url") {
                let match = v.pattern.exec(req.url);
                v.command(match);
            }
        }
    });
});

proxyReq.on("proxyRes", (proxyRes, req, res) => {
    let vulns = config.vulnerabilities.filter((vuln,index) => vuln.comp(req, vuln));
    let setCookie = cookieUtil.parseSetCookie(proxyRes.headers["set-cookie"]);

    vulns.forEach( vuln => {
        // session id
        if (vuln.weakSession ) {
            let setCookie2 = cookieUtil.regenerateSession(req.headers["cookie"], setCookie, vuln.weakSession.cookie, vuln.weakSession.generator);
            if (setCookie2 !== undefined) {
                proxyRes.headers["set-cookie"] = cookieUtil.serializeSetCookie(setCookie2);
            }
        }
    });
});

function preparePattern(){
    const stringToArray = (s,defaultValue) => {
        if (Array.isArray(s)) return s;
        else if (typeof s === "string") return [s];
        else return defaultValue;
    },
    compareReqPartial = (req, vuln) => {
        // partial match. "/foo/bar"
        return (vuln.method.indexOf(req.method.toLowerCase()) !== -1) && 
            (req.url.indexOf(vuln.pattern) !== -1);
    },
    compareReqBackwordMatch = (req, vuln) => {
        // backword match. "/foo/bar$"
        return (vuln.method.indexOf(req.method.toLowerCase()) !== -1) && 
            (req.url.substr(req.url.length - vuln.pattern.length) === vuln.pattern);
    },
    compareReqForwardMatch = (req, vuln) => {
        // forward match. "^/foo/bar"
        return (vuln.method.indexOf(req.method.toLowerCase()) !== -1) && 
            (req.url.indexOf(vuln.pattern) === 0);
    },
    compareReqExactMatch = (req, vuln) => {
        // exact match. "^/foo/bar$"
        return (vuln.method.indexOf(req.method.toLowerCase()) !== -1) && 
            (req.url === vuln.pattern);
    },
    compareReqRegExp = (req, vuln) => {
        // RegExp. /^\/foo\/bar$/
        return (vuln.method.indexOf(req.method.toLowerCase()) !== -1) && 
            (vuln.pattern.test(req.url));
    };

    config.vulnerabilities.forEach(vuln => {
        let fm, bm;

        vuln.method = stringToArray(vuln.method);
        if (Array.isArray(vuln.method)) {
            if (vuln.method.length === 1 && vuln.method[0] === "*" ) {
                delete vuln.method;
            } else {
                vuln.method.forEach( (method, index) => {
                    vuln.method[index] = method.toLowerCase();
                });
            }
        }
        if (!vuln.method) vuln.method = ["get","post","head","options","delete","put","trace","connect"];

        if (typeof vuln.url === "string") {
            fm = vuln.url.charAt(0) === "^";
            bm = vuln.url.charAt(vuln.url.length - 1) === "$";
            if (vuln.url === "*") {
                vuln.pattern = "";
                vuln.comp = truism;
            } else if (!fm && !bm) {
                vuln.pattern = vuln.url;
                vuln.comp = compareReqPartial;
            } else if (!fm && bm) {
                vuln.pattern = vuln.url.substr(0, vuln.url.length - 1);
                vuln.comp = compareReqBackwordMatch;
            } else if (fm && !bm) {
                vuln.pattern = vuln.url.substr(1);
                vuln.comp = compareReqForwardMatch;
            } else {
                vuln.pattern = vuln.url.substr(1, vuln.url.length - 2);
                vuln.comp = compareReqExactMatch;
            }
        } else if (vuln.url instanceof RegExp) {
            vuln.pattern = vuln.url;
            vuln.comp = compareReqRegExp;
        } else {
            vuln.comp = noop;
        }
        let canonicalize = (obj, defaultValue) => {
            if (Array.isArray(defaultValue)) {
                obj = stringToArray(obj, defaultValue);
                obj.forEach((element, index) => {
                    if (typeof element === "string") {
                        obj[index] = element.toLowerCase();
                    }
                });
            } else if (typeof defaultValue === "object") {
                if (typeof obj !== "object"){
                    obj = defaultValue;
                }
                Object.keys(obj).forEach(propName => {
                    let t = obj[propName];
                    delete obj[propName];
                    obj[propName.toLowerCase()] = t;
                });
            }
            return obj;
        };
        vuln.stripRequestHeaders = canonicalize( vuln.stripRequestHeaders, []);
        vuln.replaceRequestHeaders = canonicalize(vuln.replaceRequestHeaders, {});
        vuln.stripResponseHeaders = canonicalize(vuln.stripResponseHeaders, []);
        vuln.replaceResponseHeaders = canonicalize(vuln.replaceResponseHeaders, {});
        if (typeof vuln.weakSession === "object") {
            if (typeof vuln.weakSession.generator !== "function") {
                vuln.weakSession.generator = defaultSessionGenerator;
            }
        } else {
            delete vuln.weakSession;
        }
        if (typeof vuln.osCommandInjection === "object") {
            let s = vuln.osCommandInjection.source.toLowerCase();
            if (s !== "url" && s !== "body") s = "url";
            vuln.osCommandInjection.source = s;
            if (typeof vuln.osCommandInjection.command !== "function") {
                vuln.osCommandInjection.command = defaultOsCommandInjectionHandler;
            }
        } else {
            delete vuln.osCommandInjection;
        }
    });
}


preparePattern();
let proxyServer = http.createServer(app);
console.log(`listening on port ${config.listen.port} ${config.listen.hostname ? config.listen.hostname : ""}`);
proxyServer.listen(config.listen.port, config.listen.hostname);
