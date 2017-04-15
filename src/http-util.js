"use strict";

const http = require("http"),
    fs = require("fs");


http.ServerResponse.prototype.redirect = function(status, targetUrl) {
    if (targetUrl === undefined && typeof status == "string") {
        targetUrl = status;
        status = 302;
    }
    this.writeHead(status, { "Location" : targetUrl });
    this.end();
};

http.ServerResponse.prototype.respondJson = function(json) {
    this.writeHead(200, { "Content-Type" : "application/json; charset=utf-8", "Cache-Control" : "no-store" });
    this.end(JSON.stringify(json));
};

http.ServerResponse.prototype.respondJsonp = function(json, callbackName) {
    if( callbackName === undefined ) callbackName = "callback";

    callbackName = callbackName.replace( /([^\w])/g, function( s, p ){ return "\\u" + /([0-9a-fA-F]{4})$/.exec( "0000" + p.charCodeAt( 0 ).toString(16) )[ 0 ]; } );
    this.writeHead( 200, { "Content-Type" : "application/javascript; charset=utf-8" } );
    this.end( callbackName + "(" + JSON.stringify( json ) + ")" );
};

http.ServerResponse.prototype.respondError = function(status, callback) {
    const defaultHtml = {
        "400" :"Bad Request",
        "401" : "Unauthorized",
        "402" : "Payment Required",
        "403" : "Forbidden",
        "404" : "Not Found",
        "405" : "Method Not Allowed",
        "500" : "Internal Server Error",
        "503" : "Service Unavailable",
    };

    let html = "";
    if (callback === undefined) {
        html = defaultHtml[status] || "";
    } else if(typeof callback === "string") {
        html = callback;
    } else if(typeof callback === "function") {
        html = callback();
    }
    this.writeHead( status, {"Content-Type" : "text/html; charset=utf-8"});
    this.end(html);
};

function mimetype(filename) {
    const types = {
        "txt" : "text/plain",
        "htm" : "text/html",
        "html" : "text/html",
        "js" : "text/javascript",
        "css" : "text/css",
        "json" : "application/json",
        "jpg" : "image/jpeg",
        "jpeg" : "image/jpeg",
        "png" : "image/png",
        "gif" : "image/gif",
        "xml" : "text/xml",
    };
    let extension = /([^\.]+)$/.exec(filename)[1];
    return types[ extension ] || "applicaion/octet-stream";
}

function respondStaticFile () {
    var lastModified = {};

    return function(filename, options){
        let opt = {
            dir : __dirname,
            cache : true,
            dirTraversal : true,
        };
        for (let name in options) {
            opt[name] = options[name];
        }
        if (opt.dir.charAt(opt.dir.length - 1) === "/") {
            if (filename.charAt(0) === "/") {
                filename = `${opt.dir}${filename.substr(1)}`;
            } else {
                filename = `${opt.dir}${filename}`;
            }
        } else {
            if (filename.charAt(0) === "/") {
                filename = `${opt.dir}${filename}`;
            } else {
                filename = `${opt.dir}/${filename}`;
            }
        }
        if (!opt.dirTraversal && filename.indexOf("../") !== -1) return this.respondError(400);
        if (!opt.dirTraversal && filename.indexOf("..\\") !== -1) return this.respondError(400);
        if (filename.indexOf("\0") !== -1) return this.respondError(400);
        if (opt.cache && lastModified[filename] === undefined) {
            fs.stat( filename, function( error, stats ){
                if( !error ){
                    lastModified[ filename ] = stats.mtime;
                }
            });
        }
        fs.readFile(filename, (err, data) => {
            if( err ){
                console.log( err );
                return this.respondError(404);
            }
            let ct = mimetype(filename);
            if (opt.cache) {
                if (lastModified[filename]) {
                    this.setHeader( "Last-Modified", lastModified[filename].toGMTString());
                }
                this.setHeader("Cache-Control", 60 * 30); // 30min
            }
            this.writeHead(200, {"Content-Type" : ct});
            this.end( data );
        });
    };
};


/*
 * options : {
 *   "dir" : dirname. default __dirname
 *   cache : ture/false. default true
 * }
 */
http.ServerResponse.prototype.respondStaticFile = respondStaticFile();

