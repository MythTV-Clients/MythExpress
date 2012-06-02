
/**
 * Module dependencies.
 */

var os = require("os");
var express = require('express');
var app = module.exports = express.createServer();
var http = require('http');
var url = require('url');
var gzip = require('connect-gzip');
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
    var logfile = require('fs').createWriteStream(parsed.logfile, { 'flags': 'a', 'encoding': "utf8" });
    process.__defineGetter__('stdout', function() { return logfile; });
    console.log('Started log');
}

// Configuration

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
});

app.configure('development', function(){
    app.set('view options', { pretty: true });
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
    app.use(express.static(__dirname + '/public'));
});

app.configure('production', function(){
    app.use(express.errorHandler()); 
    app.use(gzip.gzip());
    app.use(gzip.staticGzip(__dirname + '/public', { maxAge: 18 * 60 * 60 }));

    // we only minify in production
    var assetManager = require('connect-assetmanager');

    var assetManagerGroups = {
        'js' : {
            'route' : new RegExp("/js/all.js"),
            'path' : __dirname + '/public/js/',
            'dataType' : 'javascript',
            'stale' : true,
            'files' : [
                "jquery-1.7.1.js",
                "jquery-ui-1.8.17.custom.js",
                "history.js",
                "history.adapter.jquery.js",
                "mythexpress.js"
            ]
        },
        'css' : {
            'route' : new RegExp("/css/dark-hive/all.css"),
            'path' : __dirname + '/public/css/',
            'dataType' : 'css',
            'stale' : true,
            'files' : [
                "HTML5Reset.css",
                "dark-hive/jquery-ui-1.8.17.custom.css",
                "mythexpress.css"
            ]
        }
    };

    app.use(assetManager(assetManagerGroups));
});


// MythTV

var mythArgs = { };
if (process.env["MX_AFFINITY"]) {
    mythArgs.affinity = process.env["MX_AFFINITY"];
}

var mythtv = require('./mythtv')(mythArgs);


// Routes

require('./boot')(app, url, mythtv);

app.listen(process.env["MX_LISTEN"] || 6565);
console.log("MythTV Express server listening on port %d in %s mode", app.address().port, app.settings.env);

var ad = mdns.createAdvertisement(mdns.tcp('http'),
                                  app.address().port, 
                                  {
                                      name : "MythExpress on " + os.hostname()
                                  });
ad.start();