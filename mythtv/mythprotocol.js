
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
// isConnected()     - true when connected to a backend
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


// watch libs/libmythbase/mythversion.h
//    or https://github.com/MythTV/mythtv/blame/master/mythtv/libs/libmythbase/mythversion.h

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
    "76" : "FireWilde",
    "77" : "WindMark",
    "78" : "IceBurns",
    "79" : "BasaltGiant",
    "80" : "TaDah!",
    "81" : "MultiRecDos",
    "82" : "IdIdO",
    "83" : "SeaBird",
    "Latest" : "82"
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
    var backend = { };

    function emitDisconnect() {
        process.nextTick(function () {
            This.emit("disconnect");
        });
    }

    function eventTimeToString(eventTime, override) {
        var t = new Date(eventTime * 1000);
        if (backend.protocolVersion > "74" && !override)
            return t.getFullYear() + "-" + ("0" + (t.getMonth()+1)).substr(-2) + "-" + ("0" + t.getDate()).substr(-2) + "T" + ("0" + t.getHours()).substr(-2) + ":" + ("0" + t.getMinutes()).substr(-2) + ":" + ("0" + t.getSeconds()).substr(-2);
        else
            return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth()+1)).substr(-2) + "-" + ("0" + t.getUTCDate()).substr(-2) + "T" + ("0" + t.getUTCHours()).substr(-2) + ":" + ("0" + t.getUTCMinutes()).substr(-2) + ":" + ("0" + t.getUTCSeconds()).substr(-2);
    }

    function getProgramFlags(programFlags) {
        return {
            InUse          : !!(programFlags & 0x00700000),
            InUsePlaying   : !!(programFlags & 0x00200000),
            CommercialFree : !!(programFlags & 0x00000800),
            HasCutlist     : !!(programFlags & 0x00000002),
            BookmarkSet    : !!(programFlags & 0x00000010),
            Watched        : !!(programFlags & 0x00000200),
            AutoExpirable  : !!(programFlags & 0x00000004),
            Preserved      : !!(programFlags & 0x00000400),
            Repeat         : !!(programFlags & 0x00001000),
            Duplicate      : !!(programFlags & 0x00002000),
            Reactivated    : !!(programFlags & 0x00004000),
            DeletePending  : !!(programFlags & 0x00000080)
        };
    }

    function getVideoProps(propMask) {
        return {
            HDTV       : !!(propMask & 0x01),
            Widescreen : !!(propMask & 0x02),
            AVC        : !!(propMask & 0x04),
            "720p"     : !!(propMask & 0x08),
            "1080p"    : !!(propMask & 0x10),
            Damaged    : !!(propMask & 0x20)
        };
    }

    var pullProgramInfo = function (message) {
        program = { };

        program.Title = message.shift();
        program.SubTitle = message.shift();
        program.Description = message.shift();
        if (backend.protocolVersion >= "67") {
            program.Season = message.shift();
            program.Episode = message.shift();
        }
        if (backend.protocolVersion >= "78") {
            var totalEpisodes = message.shift();
        }
        if (backend.protocolVersion >= "76") {
            program.SyndicatedEpisode = message.shift();
        }
        program.Category = message.shift();
        program.Channel = { };
        program.Channel.ChanId = message.shift();
        program.Channel.ChanNum = message.shift();
        program.Channel.CallSign = message.shift();
        program.Channel.ChanName = message.shift();
        program.FileName = message.shift();
        program.FileSize = message.shift();
        program.StartTime = eventTimeToString(message.shift(), true);
        program.EndTime = eventTimeToString(message.shift(), true);
        program.FindId = message.shift();
        program.HostName = message.shift();
        program.SourceId = message.shift();
        program.CardId = message.shift();
        program.Channel.InputId = message.shift();
        program.Recording = { };
        program.Recording.Priority = message.shift();
        program.Recording.Status = message.shift();
        program.Recording.RecordId = message.shift();
        program.Recording.RecType = message.shift();
        program.Recording.DupInType = message.shift();
        program.Recording.DupMethod = message.shift();
        program.Recording.StartTs = eventTimeToString(message.shift(), true);
        program.Recording.EndTs = eventTimeToString(message.shift(), true);
        program.ProgramFlags = message.shift();
        program.ProgramFlags_ = getProgramFlags(program.ProgramFlags);
        program.Recording.RecGroup = message.shift();
        program.OutputFilters = message.shift();
        program.SeriesId = message.shift();
        program.ProgramId = message.shift();
        if (backend.protocolVersion >= "67") {
            program.Inetref = message.shift();
        }
        program.LastModified = eventTimeToString(message.shift(), true);
        program.Stars = message.shift();
        program.Airdate = message.shift();
        program.PlayGroup = message.shift();
        program.Recording.Priority2 = message.shift();
        program.ParentId = message.shift();
        program.StorageGroup = message.shift();
        program.AudioProps = message.shift();
        program.VideoProps = message.shift();
        program.SubProps = message.shift();
        program.Year = message.shift();

        if (backend.protocolVersion >= "76") {
            program.PartNumber = message.shift();
            program.PartTotal = message.shift();
        }

        if (backend.protocolVersion >= "70") {
            var categoryType = message.shift();
        }

        if (backend.protocolVersion >= "82") {
            program.Recording.RecordedId = message.shift();
        }

        if (backend.protocolVersion >= "83") {
            var recInput = message.shift();
        }

        return program;
    };

    var pushProgramInfo = function (message, program) {
        message.push(program.Title);
        message.push(program.SubTitle);
        message.push(program.Description);
        if (backend.protocolVersion >= "67") {
            message.push(program.Season);
            message.push(program.Episode);
        }
        message.push(program.Category);
        message.push(program.Channel.ChanId);
        message.push(program.Channel.ChanNum);
        message.push(program.Channel.CallSign);
        message.push(program.Channel.ChanName);
        message.push(program.FileName);
        message.push(program.FileSize);
        message.push(program.StartTime);
        message.push(program.EndTime);
        message.push(program.FindId);
        message.push(program.HostName);
        message.push(program.SourceId);
        message.push(program.CardId);
        message.push(program.Channel.InputId);
        message.push(program.Recording.Priority);
        message.push(program.Recording.Status);
        message.push(program.Recording.RecordId);
        message.push(program.Recording.RecType);
        message.push(program.Recording.DupInType);
        message.push(program.Recording.DupMethod);
        message.push(program.Recording.StartTs);
        message.push(program.Recording.EndTs);
        message.push(program.ProgramFlags);
        message.push(program.Recording.RecGroup);
        message.push(program.OutputFilters);
        message.push(program.SeriesId);
        message.push(program.ProgramId);
        if (backend.protocolVersion >= "67") {
            message.push(program.Inetref);
        }
        message.push(program.LastModified);
        message.push(program.Stars);
        message.push(program.Airdate);
        message.push(program.PlayGroup);
        message.push(program.Recording.Priority2);
        message.push(program.ParentId);
        message.push(program.StorageGroup);
        message.push(program.AudioProps);
        message.push(program.VideoProps);
        message.push(program.SubProps);
        message.push(program.Year);

        if (backend.protocolVersion >= "82") {
            message.push(program.Recording.RecordedId);
        }

        if (backend.protocolVersion >= "83") {
            message.push(""); // recInput
        }

        return message;
    };

    // ////////////////////////////////////////////////
    // myth connection management
    // ////////////////////////////////////////////////

    function makeConnection() {
        log.info("open myth protocol connection " + backend.host + " " + backend.lastConnect.toString());
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

        log.info("myth protocol socket connected for " + backend.clientName);
        socket.write(["MYTH_PROTO_VERSION", backend.protocolVersion, protocolTokens[backend.protocolVersion]]);
    });

    socket.on("close", function (hadError) {
        var wasConnected = backend.connected || backend.connectionPending;
        backend.connected = backend.connectionPending = false;
        if (wasConnected)
            emitDisconnect();
        log.info("socket closed (withError: " + hadError + ")");
        doConnect();
    });

    socket.on("end", function () {
        backend.connected = backend.connectionPending = false;
        log.info("myth event socket end()");
        emitDisconnect();
    });

    socket.on("error", function (error) {
        log.info("myth event socket error");
        log.info(error);
        if (error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
            // probably the myth host is down
            backend.connected = backend.connectionPending = false;
            emitDisconnect();
            // a close event will follow and reconnect will happen there
            //doConnect();
        }
    });


    // ////////////////////////////////////////////////
    // backend events
    // ////////////////////////////////////////////////

    socket.on("message", function (message) {

        if (message[0] === "BACKEND_MESSAGE") {
            message.shift();

            if (message[0].substr(0,13) === "SYSTEM_EVENT ") {
                var args = message[0].split(/ /);
                args.shift();
                var event = { };
                event.name = args.shift();
                while (args.length > 0) {
                    var data = args.shift();
                    event[data.toLowerCase()] = args.shift();
                }

                if (event.name === "REC_EXPIRED") {
                    process.nextTick(function () {
                        This.emit("REC_EXPIRED", event);
                    });
                }

                else if (event.name === "CLIENT_CONNECTED" ||
                         event.name === "CLIENT_DISCONNECTED" ||
                         event.name === "SCHEDULER_RAN" ||
                         event.name === "SCHEDULE_CHANGE" ||
                         event.name === "REC_PENDING" ||
                         event.name === "REC_STARTED" ||
                         event.name === "REC_FINISHED" ||
                         event.name === "REC_DELETED") {
                    log.info('Ignored System event:');
                    log.info(event);
                    // do nothing
                }

                else {
                    log.info('System event:');
                    log.info(event);
                }
            }

            else if (message[0].substr(0,20) === "SYSTEM_EVENT_RESULT ") {
            }

            else {
                var head = message[0].split(/[ ]/);
                var msgType = head[0];
                if (msgType === "RECORDING_LIST_CHANGE") {
                    var change = message.shift().substring(22).split(/[ ]/);
                    var program = pullProgramInfo(message);
                    var event = {
                        changeType : change[0]
                    };
                    if (event.changeType === "ADD" || event.changeType === "DELETE") {
                        event.ChanId = change[1];
                        event.StartTs = change[2];
                    }
                    process.nextTick(function () {
                        This.emit("RECORDING_LIST_CHANGE", event, program);
                    });
                }

                else if (msgType === "VIDEO_LIST_CHANGE") {
                    process.nextTick(function () {
                        This.emit("VIDEO_LIST_CHANGE");
                    });
                }

                else if (msgType === "SHUTDOWN_COUNTDOWN") {
                    process.nextTick(function () {
                        This.emit("SHUTDOWN_COUNTDOWN", head[1]);
                    });
                }

                else if (msgType === "SHUTDOWN_NOW") {
                    process.nextTick(function () {
                        This.emit("SHUTDOWN_NOW");
                    });
                }

                else if (msgType === "UPDATE_FILE_SIZE" ||
                         msgType === "ASK_RECORDING" ||
                         msgType === "COMMFLAG_START" ||
                         msgType === "COMMFLAG_UPDATE" ||
                         msgType === "SCHEDULE_CHANGE") {
                }

                else {
                    log.info("Non system event:");
                    log.info(message);
                }
            }
        }

        else if (message[0] === "ACCEPT") {
            socket.write(["ANN", backend.mode, backend.clientName, backend.eventMode]);
            process.nextTick(function () {
                This.emit("connect", backend.protocolVersion);
            });
        }

        else if (message[0] === "REJECT") {
            backend.protocolVersion = message[1];
            if (protocolTokens[backend.protocolVersion]) {
                doConnect();
                process.nextTick(function () {
                    This.emit("protocolVersion", backend.protocolVersion);
                });
            } else {
                backend.keepOpen = false;
                log.info("Unknown protocol version '" + backend.protocolVersion + "'");
            }
        }

    });


    // ////////////////////////////////////////////////
    // external api
    // ////////////////////////////////////////////////

    this.connect = function (options) {
        for (prop in backend)
            delete backend[prop];
        for (prop in backendDefaults)
            backend[prop] = backendDefaults[prop];
        for (prop in options)
            backend[prop] = options[prop];
        backend.keepOpen = true;
        process.nextTick(doConnect);
    };

    this.disconnect = function () {
        backend.keepOpen = false;
        if (backend.connected) {
            socket.write(["DONE"]);
            // do this to avoid squelching a new connect requested
            // while we're waiting for the socket to close
            backend.connected = backend.connectionPending = false;
        }
    };

    this.isConnected = function () { return backend.connected; };

    this.GetProtocolVersion = function () { return backend.protocolVersion; };
    this.getProgramFlags = getProgramFlags;
    this.getVideoProps = getVideoProps;

    this.Monitor = "Monitor";
    this.Playback = "Playback";

    this.NoEvents = 0;
    this.AllEvents = 1;
    this.NoSYSTEM_EVENTs = 2;
    this.OnlySYSTEM_EVENTs = 3;
};


util.inherits(module.exports, events.EventEmitter);
