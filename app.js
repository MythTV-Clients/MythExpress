
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
    app.use(gzip.staticGzip(__dirname + '/public', { maxAge: 18 * 60 * 60 }));
});


// Routes

require('./boot')(app, url, mythtv);

app.listen(6565);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);