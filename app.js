
/**
 * Module dependencies.
 */

var os = require("os");
var fs = require("fs");
var util = require("util");
var express = require("express");
var app = module.exports = express();
var http = require("http");
var url = require("url");
var path = require("path");
var mdns = require("mdns");
var ws = require("ws");

// Array Remove - By John Resig (MIT Licensed)
// http://ejohn.org/blog/javascript-array-remove/
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

// Command line arguments

var nopt = require("nopt");

var knownOpts = { "logfile" : path };
var parsed = nopt(knownOpts, { }, process.argv, 2)

if (parsed.hasOwnProperty("logfile")) {
    var logfile = fs.createWriteStream(parsed.logfile, { "flags": "a", "encoding": "utf8" });
    process.__defineGetter__("stdout", function() { return logfile; });
    console.log("Started log");
}

// Configuration

app.configure(function() {
    app.set("views", __dirname + "/views");
    app.set("view engine", "jade");
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
});

app.configure("development", function() {
    app.locals.pretty = true;
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    app.use(express.static(__dirname + "/public"));
});

app.configure("production", function() {
    app.use(express.errorHandler());
    app.use(express.compress());
    app.use(express.staticCache());
    app.use(express.static(__dirname + '/public', {maxAge: 18 * 24 * 60 * 60 }));

    // we only minify in production
    var assetManager = require("connect-assetmanager");

    var assetManagerGroups = {
        "js" : {
            "route" : new RegExp("/js/all.js"),
            "path" : __dirname + "/public/js/",
            "dataType" : "javascript",
            "stale" : true,
            "files" : [
                "jquery-1.8.0.js",
                "jquery-ui-1.8.23.custom.js",
                "history.options.js",
                "history.js",
                "history.adapter.jquery.js",
                "jquery.cookie.js",
                "lightbox.js",
                "mythexpress.js"
            ]
        },
        "browser" : {
            "route" : new RegExp("/css/dark-hive/browser.css"),
            "path" : __dirname + "/public/css/",
            "dataType" : "css",
            "stale" : true,
            "files" : [
                "HTML5Reset.css",
                "dark-hive/jquery-ui-1.8.23.custom.css",
                "lightbox.css",
                "mythexpress.css",
                "browser.css"
            ]
        },
        "webapp" : {
            "route" : new RegExp("/css/dark-hive/webapp.css"),
            "path" : __dirname + "/public/css/",
            "dataType" : "css",
            "stale" : true,
            "files" : [
                "HTML5Reset.css",
                "dark-hive/jquery-ui-1.8.23.custom.css",
                "lightbox.css",
                "mythexpress.css",
                "webapp.css"
            ]
        }
    };

    app.use(assetManager(assetManagerGroups));
});

app.sendHeaders = function (req, res) {
    var context = res.locals.Context;
    for (var key in context)
        res.header("X-MX-" + key, context[key]);
    res.header("Cache-Control", "no-cache");
};


//var frontPage = require("./frontpage");
//app.use(frontPage);


// Routes

require("./boot")({ app       : app,
                    url       : url,
                    os        : os,
                    fs        : fs,
                    util      : util,
                    __dirname : __dirname,
                    MX        : require("./frontpage"),
                    frontends : new (require("./mythtv/frontends.js")),
                    mxutils   : require("./mxutils")
                  });

if (app.settings.env === "development") {
    app.post("/log", function (req, res) {
        if (req.body.hasOwnProperty("msg"))
            console.log("Client: " + req.body.msg);
        res.send(200);
    });
}

GLOBAL.appEnv = app.settings.env || "development";


// Server

var websocket;
var webserver = http.createServer(app)
    .listen(process.env["MX_LISTEN"] || 6565,
            function () {
                console.log("create a socket server on:");
                console.log(webserver.address());
                websocket = new ws.Server({ server : webserver });

                console.log("MythTV Express server listening on port %d in %s mode",
                            webserver.address().port, app.get("env") || "development");

                // MythTV model

                var mythArgs = {
                    app : app,
                    websocket : websocket
                };
                if (process.env["MX_AFFINITY"]) {
                    mythArgs.affinity = process.env["MX_AFFINITY"];
                }

                app.mythtv = require("./mythtv")(mythArgs);

                // Tell the world we're here

                var ad = mdns.createAdvertisement(mdns.tcp("http"),
                                                  webserver.address().port,
                                                  {
                                                      name : "MythExpress on " + os.hostname()
                                                  });
            });
