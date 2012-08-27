
var net = require("net");
var util = require("util");
var mdns = require('mdns');
var events = require("events");
var mxutils = require("../mxutils");

// since the frontend list is network-wide rather than per-backend
// we keep the list global and the only the accessors are per module
// object instance

var frontends = {
    byHost : { },
    byName : { }
};

var frontendBrowser = mdns.createBrowser(mdns.tcp('mythfrontend'));
var frontendEvents = new events.EventEmitter();

frontendBrowser.on('serviceUp', function(service) {
    //console.log("frontend up: ", service);
    var addr = mxutils.filterIPv4(service.addresses);
    if (addr.length > 0) {
        service.ipv4 = addr[0];
        service.shortHost = mxutils.hostFromService(service);
        frontends.byName[service.name] = service;
        frontends.byHost[service.shortHost] = { fullname : service.name, address : addr[0] };
        frontendEvents.emit("change", Object.keys(frontends.byHost));
    }
});

frontendBrowser.on('serviceDown', function(service) {
    //console.log("frontend down: ", service);
    if (frontends.byName.hasOwnProperty(service.name)) {
        var serv = frontends.byName[service.name];
        delete frontends.byHost[serv.shortHost];
        delete frontends.byName[serv.name];
        frontendEvents.emit("change", Object.keys(frontends.byHost));
    }
});

frontendBrowser.start();

function SendMessage(host, message, senderCookie) {
    if (frontends.byHost.hasOwnProperty(host)) {

        var fe = frontends.byName[frontends.byHost[host].fullname];

        (function (hostIP) {
            var socket = new net.Socket();
            var reply = "";
            socket.on("data", function (data) {
                reply = reply + data.toString();
                if (reply.match(/OK/)) {
                    socket.end("exit\n");
                } else if (reply.match(/ERROR/)) {
                    console.log(message);
                    console.log(reply);
                    socket.end("exit\n");
                } else if (reply.match(/[#]/)) {
                    reply = "";
                    socket.write(message + "\n");
                }
            });
            socket.on("error", function (error) {
                frontendEvents.emit("senderror", { Host: host, SenderCookie : senderCookie });
            });
            socket.connect(6546, hostIP);
        })(fe.ipv4);
    }
}

function SendToFrontend (args, mythtv) {
    var message;
    if (args.hasOwnProperty("FileName") && mythtv.byFilename.hasOwnProperty(args.FileName)) {
        var prog = mythtv.byFilename[args.FileName];
        // should be a UTC -> local transform for protocols < 75
        message = "play program " + prog.Channel.ChanId + " " + prog.Recording.StartTs + " resume";
    } else if (args.hasOwnProperty("VideoId") && mythtv.byVideoId[args.VideoId]) {
        message = "play file myth://Videos/" + mythtv.byVideoId[args.VideoId].FileName.toString("utf8").replace(/ /g, "%20");
    }
    if (message.length > 0) {
        SendMessage(args.Host, message, args.SenderCookie);
    }
}


module.exports = function () {
    var This = this;

    events.EventEmitter.call(this);

    // ////////////////////////////////////////////////
    // external api
    // ////////////////////////////////////////////////

    this.SendToFrontend = SendToFrontend;
    this.FrontendList = function () { return Object.keys(frontends.byHost); };

    frontendEvents.on("change", function (feList) {
        process.nextTick(function () {
            This.emit("change", feList);
        });
    });

    frontendEvents.on("senderror", function (details) {
        process.nextTick(function () {
            This.emit("senderror", details);
        });
    });
};


util.inherits(module.exports, events.EventEmitter);
