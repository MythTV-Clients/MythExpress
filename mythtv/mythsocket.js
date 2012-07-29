
// this is the lowest level of the native myth protocol; it sends
// and receives myth messages which are (length)(message) and not
// much else

net = require("net");
var util = require("util");
var events = require("events");


function mythCommand(args) {
    var cmd = args.join(" ");
    var buf = new Buffer(cmd);  // utf8 encoding by default
    var len = new Buffer((buf.length + "        ").substr(0,8));
    var cmdBuf = new Buffer(8 + buf.length);
    len.copy(cmdBuf);
    buf.copy(cmdBuf, 8);
    return cmdBuf;
}

var heartbeatSeconds = 6;


module.exports = function () {
    var This = this;

    events.EventEmitter.call(this);

    // ////////////////////////////////////////////////
    // socket embrace and extend
    // ////////////////////////////////////////////////

    var socket = new net.Socket();

    socket.on("connect", function () {
        socket.setKeepAlive(true, heartbeatSeconds * 1000);
        This.emit("connect");
    });

    socket.on("timeout", function () {
        This.emit("timeout");
    });

    socket.on("close", function (hadError) {
        This.emit("close", hadError);
    });

    socket.on("end", function () {
        This.emit("end");
    });

    socket.on("error", function (error) {
        This.emit("error", error);
    });

    var inPrefix = true;
    var needed = 8;

    var incomingLen = 0;
    var incoming = new Buffer(65535);

    socket.on("data", function(data) {

        data.copy(incoming, incomingLen);
        incomingLen += data.length;

        while (incomingLen >= needed) {

            var message = incoming.slice(0, needed).toString("utf8");
            if (needed < incomingLen) // move unused bytes to beginning of incoming buffer
                incoming.copy(incoming, 0, needed, incomingLen);
            incomingLen -= needed;

            if (inPrefix) {
                inPrefix = false;
                needed = Number(message);
            } else {

                process.nextTick(function() {
                    This.emit("message", message.split(/\[\]:\[\]/));
                });

                inPrefix = true;
                needed = 8;

            }
        }
    });

    // ////////////////////////////////////////////////
    // external api
    // ////////////////////////////////////////////////

    this.connect = function (port, host) {
        socket.connect(port || 6543, host || "localhost");
    };

    this.write = function (tokens) {
        socket.write(mythCommand(tokens));
    };
};


util.inherits(module.exports, events.EventEmitter);
