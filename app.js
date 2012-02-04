
/**
 * Module dependencies.
 */

var express = require('express');
var app = module.exports = express.createServer();
var http = require('http');
var mythtv = require('./mythtv')();
var url = require('url');
var gzip = require('connect-gzip');
var piler = require('piler');


// Configuration

var clientjs = piler.createJSManager({ urlRoot : "/min/" });
var clientcss = piler.createCSSManager({ urlRoot : "/min/" });

app.configure(function(){

    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);

    clientjs.bind(app);
    clientcss.bind(app);

    clientcss.addFile(__dirname + "/public/css/HTML5Reset.css");
    clientcss.addFile(__dirname + "/public/css/overcast/jquery-ui-1.8.16.custom.css");
    clientcss.addFile(__dirname + '/public/css/mythnode.css');

    clientjs.addFile(__dirname + "/public/js/jquery-1.6.2.min.js");
    clientjs.addFile(__dirname + "/public/js/jquery-ui-1.8.16.custom.min.js");
    clientjs.addFile(__dirname + "/public/js/jquery.history.js");
    clientjs.addFile(__dirname + "/public/js/jquery.timer.js");
    clientjs.addFile(__dirname + "/public/js/mythnode.js");

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
});


// Routes

require('./boot')(app, url, mythtv);

app.listen(6565);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);