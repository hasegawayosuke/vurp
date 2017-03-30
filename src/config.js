"use strict";

const config = {
	hostname : "example.jp",		
	upstream : "http://target.example.com",
	listen : {
		port : 80,
//		hostname : "0.0.0.0"	// if hostname is specified, listen only that address.
	},
	overrideHost : "utf-8.jp",
	vulnerabilities : [
		{
			url : "*",
			method : "*",
			replaceResponseHeaders : {"X-XSS-Protection" : "0", "X-New-Header" : function(){ return "" + ~~(new Date());} },
			stripResponseHeaders : [ "X-Content-Type-Options", "X-Frame-Options" ],
			removeHttpOnlyFlag : true,
			removeSecureFlag : true,
		},
        {
            url : "^/foo?q",    
            method : "get",
            stripRequestHeaders : ["Accept-Encoding"],  
            stripResponseHeaders: ["Content-Length"],  
            replaceHtml : {                           
                pattern : /(<input id="q"[^>]* value=")([^"]*)"/,   
                replacement : function(){                          
                    let unescapeHtml = s => {
                        return s.replace( /\&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot);/g, (x,s) => {
                            if (s === "lt") return "<";
                            if (s === "gt") return ">";
                            if (s === "quot") return "\"";
                            if (s.charAt(1) === "x") {
                                return String.fromCodePoint(parseInt(s.substr(2), 16));
                            }
                            return String.fromCodePoint(parseInt(s.substr(1), 10));
                        });
                    };
                    let value = unescapeHtml(arguments[2]);
                    return arguments[1] + value + '"';
                }
            }
        },
		{
			url : /^\/bar\?/,
			method : "get",
			osCommandInjection : {
				source : "url", // or body
				pattern : /^\/bar\?q=[^&]*(?:%7C|%7c|\|)([^&]+)/,
				/*
				command : (match) => {
					if (match && match[1]) {
						let program = decodeURIComponent(match[1]);
						require("child_process").exec(program);
					}
				}
				*/
			}
		}
	]
};

exports.config = config;

