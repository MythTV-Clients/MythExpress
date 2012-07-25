
/**
 * Module dependencies.
 */

var os = require("os");
var fs = require("fs");
var util = require("util");
var express = require("express");
var app = module.exports = express.createServer();
var http = require("http");
var url = require("url");
var gzip = require("connect-gzip");
var path = require("path");
var mdns = require("mdns");

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
    app.use(express.session({
        secret   : "sauce",
        key      : "mythexpress",
        path     : "/",
        cookie   : {
            httpOnly : false,
            maxAge   : null
        }
    }));

    // no cookie with these files
    ["/js/all.js", "/css/dark-hive/browser.css", "/css/dark-hive/webapp.css",
     "/ui/views", "/ui/buttons", "/seconds",
     "/recordinginfo", "/videoinfo", "/streaminfo",
     "/streams", "/streamstatus", "/deletestream",
     "/frontend/list"].forEach(function (path) {
         express.session.ignore.push("/js/all.js");
     });
});

app.configure("development", function() {
    app.set("view options", { pretty: true });
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
    app.use(express.static(__dirname + "/public"));
});

app.configure("production", function() {
    app.use(express.errorHandler()); 
    app.use(gzip.gzip());
    app.use(gzip.staticGzip(__dirname + "/public", { maxAge: 18 * 24 * 60 * 60 }));

    // we only minify in production
    var assetManager = require("connect-assetmanager");

    var assetManagerGroups = {
        "js" : {
            "route" : new RegExp("/js/all.js"),
            "path" : __dirname + "/public/js/",
            "dataType" : "javascript",
            "stale" : true,
            "files" : [
                "jquery-1.7.1.js",
                "jquery-ui-1.8.17.custom.js",
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
                "dark-hive/jquery-ui-1.8.17.custom.css",
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
                "dark-hive/jquery-ui-1.8.17.custom.css",
                "lightbox.css",
                "mythexpress.css",
                "webapp.css"
            ]
        }
    };

    app.use(assetManager(assetManagerGroups));
});

// app.configure(function() {
//     app.use(require("./frontpage"));
// });

app.sendHeaders = function (req, res) {
    var context = res.local("Context");
    for (var key in context)
        res.header("X-MX-" + key, context[key]);
    res.header("Cache-Control", "no-cache");
};


// MythTV

var mythArgs = { app : app };
if (process.env["MX_AFFINITY"]) {
    mythArgs.affinity = process.env["MX_AFFINITY"];
}

var mythtv = require("./mythtv")(mythArgs);

//var frontPage = require("./frontpage");
//app.use(frontPage);


// Routes

require("./boot")({ app: app,
                    url : url,
                    os : os,
                    fs : fs,
                    util : util,
                    __dirname : __dirname,
                    mythtv: mythtv,
                    MX : require("./frontpage")
                  });

if (app.settings.env === "development") {
    app.post("/log", function (req, res) {
        if (req.body.hasOwnProperty("msg"))
            console.log("Client: " + req.body.msg);
        res.send(200);
    });
}


// Server

app.listen(process.env["MX_LISTEN"] || 6565);
console.log("MythTV Express server listening on port %d in %s mode", app.address().port, app.settings.env);

var ad = mdns.createAdvertisement(mdns.tcp("http"),
                                  app.address().port, 
                                  {
                                      name : "MythExpress on " + os.hostname()
                                  });
ad.start();
