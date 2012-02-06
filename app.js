
/**
 * Module dependencies.
 */

var express = require('express');
var app = module.exports = express.createServer();
var http = require('http');
var mythtv = require('./mythtv')();
var url = require('url');
var gzip = require('connect-gzip');


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

    // we only minify in production
    var assetManager = require('connect-assetmanager');

    var assetManagerGroups = {
        'js' : {
            'route' : new RegExp("/all/js.js"),
            'path' : __dirname + '/public/js/',
            'dataType' : 'javascript',
            'stale' : true,
            'files' : [
                "jquery-1.6.2.min.js",
                "jquery-ui-1.8.16.custom.min.js",
                "jquery.history.js",
                "jquery.timer.js",
                "mythnode.js"
            ]
        },
        'css' : {
            'route' : new RegExp("/all/css.css"),
            'path' : __dirname + '/public/css/',
            'dataType' : 'css',
            'stale' : true,
            'files' : [
                "HTML5Reset.css",
                "overcast/jquery-ui-1.8.16.custom.css",
                "mythnode.css"
            ]
        }
    };

    var assetsManagerMiddleware = assetManager(assetManagerGroups);

    app.use('/',
            assetsManagerMiddleware,
            gzip.staticGzip(__dirname + '/public', { maxAge: 18 * 60 * 60 }));
});

// Routes

require('./boot')(app, url, mythtv);

app.listen(6565);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);