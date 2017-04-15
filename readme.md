# Vurp - Vulnerable Reverse Proxy

Vurpはリバースプロキシとして使用することで、任意のサイトを脆弱にすることができるWAF(Web Application Fireball)です。

## 脆弱性

Vurpが対応している脆弱性は以下の通りです。

- セキュリティのためのヘッダの削除
- 任意ページへのクロスサイトスクリプティングの埋め込み
- 推測可能なセッションIDへの振り替え
- OSコマンドインジェクション
- ローカルファイルの漏えい

## インストール

    % git clone https://github.com/hasegawayosuke/vurp.git
    % cd vurp/src
    % npm install

## 起動方法

    % node main.js

設定ファイルとしてデフォルトでは `config.js` が使用されますが、他の設定ファイルを使用する場合は `-c` または `--config` オプションを指定します。

    % node main.js -c ./foo/config.example.js

## 設定

設定は config.js に記述します。
個々の脆弱性は `vulnerabilities` 配列内に記述します。`url` および `method` が一致した場合にリクエストおよびレスポンスが指定された内容に書き換わります。

```javascript:config.js
"use strict";

const config = {
    hostname : "example.jp",                // Vurpが動くホストの名前
    upstream : "http://www.example.com",    // 上流のWebサーバ
    listen : {
        //hostname : "0.0.0.0"              // 指定された場合はそのインターフェースでのみlistenされる
        port : 80,  
    },
    overrideHost : "www.example.com",
    vulnerabilities : [
        {
            url : "*",      // 全てのURLを対象に以下の設定を適用
            method : "*",   // 全てのメソッドを対象に以下の設定を適用
            // X-XSS-Protection レスポンスヘッダを0に置換。ヘッダが存在しない場合は追加される
            replaceResponseHeaders : {"X-XSS-Protection" : "0" }, 
            // X-C-T-O、X-F-O レスポンスヘッダを削除
            stripResponseHeaders : [ "X-Content-Type-Options", "X-Frame-Options" ],
            // cookieのhttponlyフラグを削除
            removeHttpOnlyFlag : true,
            // cookieのsecureフラグを削除
            removeSecureFlag : true,
        },
        {
            url : "^/foo",
            /* .... */
        }
    ]
}
exports.config = config;
```

`url` はstringまたはRegExpが指定可能です。stringとして"*"を指定した場合は全てのURLが対象になります。stringの場合に`"^"`で始まれば先頭一致、`"$"`で終われば末尾一致、`"^"`で始まり`"$"`で終われば完全一致となります。

`method` はstringまたはArray of stringが指定可能です。例えば `"get"` を指定した場合はGETリクエストのみ、`["get", "post"]` のように指定した場合にはGETおよびPOSTが対象となります。

### リクエストヘッダの書き換え

リクエストヘッダを書き換える場合は `replaceRequestHeaders` に、リクエストヘッダを削除する場合は `stripRequestHeaders` に対象となるヘッダを指定します。複数ある場合は配列形式で指定します。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/foo",
        method : ["get", "post"],
        replaceRequestHeaders : [{"X-foo" : "1"}, {"X-bar" : "2"}],
        stripRequestHeaders : ["User-Agent", "Referer"],
    }
],
```

### レスポンスヘッダの書き換え

レスポンスヘッダを書き換える場合は `replaceResponseHeaders` に、レスポンスヘッダを削除する場合は `stripResponseHeaders` に対象となるヘッダを指定します。複数ある場合は配列形式で指定します。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/foo",
        method : ["get", "post"],
        replaceResponseHeaders : [{"X-XSS-Protection" : "0"}, {"X-Powerd-By" : "IIS/8.5"}],
        stripResponseHeaders : ["X-Content-Type-Options", "X-Frame-Options"]
    }
],
```

### Cookieのhttponlyフラグ削除

レスポンスのSet-Cookieヘッダからhttponlyフラグを削除するには、 `removeHttpOnlyFlag` に `true` を指定します。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/foo",
        method : ["get", "post"],
        removeHttpOnlyFlag : true,
    }
]
```

### Cookieのsecureフラグ削除


レスポンスのSet-Cookieヘッダからsecureフラグを削除するには、`removeSecureFlag` に `true` を指定します。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/foo",
        method : ["get", "post"],
        removeSecureFlag : true,
    },
]
```

### 推測可能なセッションID


`weakSession` にセッションIDとして使用されているCookieの名前を指定することで、セッションIDをVurp上で再生成しブラウザ側から見ると推測可能な簡単なものに付け替えることができます。

```javascript:config.js
vulnerabilities : [
    {
        weakSession : {
            cookie : "session-cookie-name", // セッションCookieの名称
        }
    }
]
```

デフォルトではセッションIDは単純な連番になりますが、これを変更したい場合は `regenerator` function を指定します。

```javascript:config.js
vulnerabilities : [
    {
        weakSession : {
            cookie : "session-cookie-name",
            regenerator : function(){ return (new Date()).getTime() }   // 現在時刻をセッションIDとして使用
        }
    },
]
```

### XSS

XSSは `replaceHtml` によって指定します。
例えば、http://example.jp/foo?q=text のようなURLのページでXSSを発生させる場合の設定例は以下のようになります。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/foo?q",    
        method : "get",
        stripRequestHeaders : ["Accept-Encoding"],  // 現在、deflateなどで正常に動作しないのでリクエストヘッダからAccept-Encodingを削除
        stripResponseHeaders: ["Content-Length"],   // レスポンスボディを書き換えるためコンテンツのサイズが変わるので、Webアプリケーションの応答したContent-Lengthを削除
        replaceHtml : {                             // replaceHtml 指令によりレスポンスボディが指定された内容に置換される。
            pattern : /(<input id="q"[^>]* value=")([^"]*)"/,   // 置換対象となるパターンをRegExpで指定
            replacement : function(){                           // 置換結果をstringまたはfunctionで指定。関数の場合、pattern.exec の結果が引数として渡される。
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
]
```

## OSコマンドインジェクション

`osCommandInjection` を指定することでOSコマンドインジェクションが発生します。OSコマンドインジェクションはVurpの動いているサーバ上でOSコマンドを実行することにより実現しています。
_不用意にOSコマンドインジェクションを許可すると、Vurpを動かしているサーバ上でリモートからあらゆる操作(例えば `rm -fr *` など)が実行可能になりますので、OSコマンドインジェクションを許可する場合は慎重に行ってください。_

```javascript:config.js
vulnerabilities : [
    {
        url : /^\/oscommand\?/,
        method : "get",
        osCommandInjection : {
            source : "url", 
            pattern : /^\/oscommand\?q=[^&]*(?:%7C|%7c|\|)([^&]+)/,      // どの部分をOSコマンドとして実行するかRegExpで指定。pattern.exec()[1]がコマンドとして実行される
        }
    },
]
```

クライアントへのレスポンスは外部コマンドが終了するまで返されません。
以前のバージョンでは外部コマンドの起動をカスタマイズするための `command` function が存在していましたが、現バージョンでは削除されました。

## ローカルファイルの漏えい

`localFile` を指定することで特定のリクエストに対してVurpの動いているサーバ上のローカルコンテンツを返すことができるようになります。
応答するためのコンテンツを置いてあるフォルダは `dir` パラメータで指定します。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/local/",
        method : "get",
        localFile : {
            dir : "c:/tmp/",
        }
    }
]
```

ファイル名はデフォルトでは `basename(location.pathname)` が使用されますが、この挙動を変えるには `filename` function を定義します。
例えば、以下の例ではURLエンコードされた形式でのディレクトリトラバーサルが実現されていますので、`http://example.jp/local/..%2f..%2f..%2fwindows%2fsystem.ini` のようなURLでアクセスすることで `c:\windows\system.ini` の内容を応答することになります。

```javascript:config.js
vulnerabilities : [
    {
        url : "^/local/",
        method : "get",
        localFile : {
            dir : "c:/tmp/",
            filename : function(urlString) { // 引数にはURLがstringで渡される
                let basename = /([^\/\\]*)$/g.exec(urlString)[1] || "";
                return decodeURIComponent(basename); 
            }
        }
    }
]
```


