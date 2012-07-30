
// a slightly higher level interface to mythtv; mythprotocol adds
// structure to messages emitted by mythsocket and hides the
// protocol dependant bits. The primary purpose of this module is to
// deliver myth events; the secondary purpose is to supply
// functionality not yet available via the services API such as
// changing recording metadata.

// Methods:
//
// open(port,host)   - open a connection
// close()           - close connection
// FillProgramInfo() - update program from passed structure
//
// Events:
//
// connect         - connected to backend
// connecting      - opening backend connection
// protocolVersion - backend requires unknown protocol (implies disconnected)
// ...             - myth messages (RECORDING_LIST_CHANGE, REC_EXPIRED, ...)


var util = require("util");
var events = require("events");
var mythsocket = require("./mythsocket");


var protocolTokens = {
    "64" : "8675309J",
    "65" : "D2BB94C2",
    "66" : "0C0FFEE0",
    "67" : "0G0G0G0",
    "68" : "90094EAD",
    "69" : "63835135",
    "70" : "53153836",
    "71" : "05e82186",
    "72" : "D78EFD6F",
    "73" : "D7FE8D6F",
    "74" : "SingingPotato",
    "75" : "SweetRock",
    "Latest" : "75"
};

var reconnectInterval = 6;

var backendDefaults = {
    keepOpen : false,
    connectionPending : false,
    connected : false,
    lastConnect : new Date(),
    host : "localhost",
    port : 6543,
    protocolVersion : protocolTokens.Latest,
    mode : "Monitor",
    clientName : "MythExpress",
    eventMode : 1
};


module.exports = function () {
    var This = this;
    events.EventEmitter.call(this);

    var socket = new mythsocket();
    var backend;

    function emitDisconnect() {
        process.nextTick(function () {
            This.emit("disconnect");
        });
    }

    // ////////////////////////////////////////////////
    // myth connection management
    // ////////////////////////////////////////////////

    function makeConnection() {
        console.log("open myth protocol connection " + backend.host + " " + backend.lastConnect.toString());
        socket.connect(backend.port, backend.host);
        backend.lastConnect = new Date();
    }

    function doConnect() {
        if (backend.keepOpen && !backend.connectionPending) {
            backend.connectionPending = true;
            var msecToWait = (reconnectInterval * 1000) - ((new Date()).valueOf() - backend.lastConnect.valueOf());
            if (msecToWait < 0) msecToWait = 0;
            setTimeout(makeConnection, msecToWait);
        }
    }

    socket.on("connect", function () {
        backend.connectionPending = false;
        backend.connected = true;

        console.log("myth protocol socket connected for " + backend.clientName);
        socket.write(["MYTH_PROTO_VERSION", backend.protocolVersion, protocolTokens[backend.protocolVersion]]);
    });

    socket.on("close", function (hadError) {
        backend.connected = backend.connectionPending = false;
        emitDisconnect();
        console.log("socket closed (withError: " + hadError + ")");
        doConnect();
    });

    socket.on("end", function () {
        backend.connected = backend.connectionPending = false;
        console.log("myth event socket end()");
        emitDisconnect();
    });

    socket.on("error", function (error) {
        console.log("myth event socket error");
        console.log(err);
        if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") {
            // probably the myth host is down
            backend.connected = backend.connectionPending = false;
            emitDisconnect();
            doConnect();
        }
    });


    // ////////////////////////////////////////////////
    // backend events
    // ////////////////////////////////////////////////

    socket.on("message", function (message) {

        if (message[0] === "BACKEND_MESSAGE") {
            message.shift();
            This.emit("BACKEND_MESSAGE", message);
        }

        else if (message[0] === "ACCEPT") {
            socket.write(["ANN", backend.mode, backend.clientName, backend.eventMode]);
            This.emit("connect");
        }

        else if (message[0] === "REJECT") {
            backendProtocol = message[1];
            if (mythProtocolTokens[backendProtocol]) {
                doConnect();
            } else {
                backend.keepOpen = false;
                console.log("Unknown protocol version '" + backendProtocol + "'");
                process.nextTick(function () {
                    This.emit("protocolVersion", backendProtocol);
                });
            }
        }

    });


    // ////////////////////////////////////////////////
    // external api
    // ////////////////////////////////////////////////

    this.connect = function (options) {
        backend = { };
        for (prop in backendDefaults)
            backend[prop] = backendDefaults[prop];
        for (prop in options)
            backend[prop] = options[prop];
        backend.keepOpen = true;
        process.nextTick(doConnect);
    };

    this.close = function () {
        backend.keepOpen = false;
        socket.close();
    };

    this.Monitor = "Monitor";
    this.Playback = "Playback";

    this.NoEvents = 0;
    this.AllEvents = 1;
    this.NoSYSTEM_EVENTs = 2;
    this.OnlySYSTEM_EVENTs = 3;
};


util.inherits(module.exports, events.EventEmitter);
