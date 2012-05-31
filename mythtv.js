
var http = require('http');
var path = require('path');
var net = require('net');
var WebSocketServer = require('ws').Server;
var fs = require('fs');
var mdns = require('mdns');

var mythProtocolTokens = {
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

var slashPattern = new RegExp("[/]");


function filterIPv4(addressList) {
    var ip4 = [ ];
    addressList.forEach(function (address) {
        if (address.match(/^[.0-9]+$/))
            ip4.push(address);
    });
    return ip4;
}

function hostFromService(service) {
    var parts = service.name.split(/[ ]/);
    return parts[parts.length - 1];
}

function toUTCString(localTs) {
    return localTs.getUTCFullYear() + "-" + ("0" + (localTs.getUTCMonth()+1)).substr(-2) + "-" + ("0" + localTs.getUTCDate()).substr(-2) + "T" + ("0" + localTs.getUTCHours()).substr(-2) + ":" + ("0" + localTs.getUTCMinutes()).substr(-2) + ":" + ("0" + localTs.getUTCSeconds()).substr(-2);
}

function localFromUTCString(utcString) {
    var utc = new Date();

    utc.setUTCFullYear(Number(utcString.substr(0,4)),
                       Number(utcString.substr(5,2))-1,
                       Number(utcString.substr(8,2)));
    utc.setUTCHours(Number(utcString.substr(11,2)),
                    Number(utcString.substr(14,2)),
                    Number(utcString.substr(17,2)));

    return utc.getFullYear() + "-" + ("0" + (utc.getMonth()+1)).substr(-2) + "-" + ("0" + utc.getDate()).substr(-2) + "T" + ("0" + utc.getHours()).substr(-2) + ":" + ("0" + utc.getMinutes()).substr(-2) + ":" + ("0" + utc.getSeconds()).substr(-2);
}


module.exports = function(args) {

    var myth = {
        connected : false,
        connectPending : false,
        isUp : false,
        bonjourService : undefined
    };

    var frontends = {
        byHost : { },
        byName : { }
    };

    var backendProtocol = mythProtocolTokens.Latest;

    var backend = {
        host : "127.0.0.1",
        customHost : false,
        port : 6544,
        method : 'GET',
        headers : { 'content-type': 'text/plain',
                    'connection': 'keep-alive',
                    'accept': 'application/json' }
    };

    var byRecGroup = { "All" : [ ], "Default" : [ ] };
    var byFilename = { };
    var byChanId = { };
    var sortedTitles = [ ];
    var progTitles = { };
    var recGroups = [ "All", "Default" ];

    var byVideoFolder = { };
    var byVideoId = [ ];


    if (process.env["MX_HOST"]) {
        backend.host = process.env["MX_HOST"];
        backend.customHost = true;
    }
    if (!!args && args.host) {
        backend.host = args.host;
        backend.customHost = true;
    }


    var titleCompare = function (t1,t2) {
        if (t1.substr(0,4) === "The ") t1 = t1.substr(4);
        if (t2.substr(0,4) === "The ") t2 = t2.substr(4);
        var t1lc = t1.toLowerCase(), t2lc = t2.toLowerCase();
        return t1lc > t2lc ? 1 : t1lc < t2lc ? -1 : t1 > t2 ? 1 : t1 < t2 ? -1 : 0;
    };

    var episodeCompare = function (t1,t2) {
        var t1Val = !!t1.Airdate ? t1.Airdate : (t1.StartTime || t1.SubTitle || t1.FileName);
        var t2Val = !!t2.Airdate ? t2.Airdate : (t2.StartTime || t2.SubTitle || t2.FileName);
        return t1Val === t2Val ? 0 : (t1Val > t2Val ? -1 : 1);
    };

    var videoCompare = function (v1,v2) {
        var t1 = v1.Title.toLowerCase();
        var t2 = v2.Title.toLowerCase();
        if (t1.substr(0,4) === "the ") t1 = t1.substr(4);
        if (t2.substr(0,4) === "the ") t2 = t2.substr(4);
        return t1 === t2 ? 0 : (t1 < t2 ? -1 : 1);
    };

    var reqJSON = function (options, callback) {
        var allOptions = { };
        Object.keys(backend).forEach(function (option) {
            allOptions[option] = backend[option];
        });
        Object.keys(options).forEach(function (option) {
            allOptions[option] = options[option];
        });
        var req = http.request(allOptions, function (reply) {
            var response = "";
            reply.setEncoding('utf8');
            reply.on('data', function (chunk) {
                response += chunk;
                //response += chunk.substr(0, chunk.length-2);
            });

            reply.on('end', function() {
                try {
                    callback(JSON.parse(response.replace(/[\r\n]/g,'')));
                } catch (err) {
                    console.log(err);
                    callback({ });
                }
                //callback(JSON.parse(response));
                response = undefined;
            })
        });
        req.end();
    };


    // ////////////////////////////////////////////////////////////////////////
    // events to the browser
    // ////////////////////////////////////////////////////////////////////////

    var eventSocket = (function () {

        var wss = new WebSocketServer({ host : '0.0.0.0', port : 6566 });
        wssClients = [ ];
        wss.on('connection', function(ws) {
            console.log('new client (' + wssClients.length + ')');
            ws.isAlive = true;
            ws.on('close', function () {
                ws.isAlive = false;
                console.log('ws client closed');
            });
            wssClients.push(ws);
        });

        function blast(msg) {
            var msgStr = JSON.stringify(msg);
            console.log('blast ' + msgStr);
            var closed = [ ];
            wssClients.forEach(function (webSocket, idx) {
                if (webSocket.isAlive) {
                    webSocket.send(msgStr);
                } else {
                    closed.unshift(idx);
                }
            });
            closed.forEach(function (clientIdx) {
                wssClients.remove(clientIdx);
            });
        }

        var recChange = { };
        var inReset = false;
        var recordingsWereReset = false;

        var vidChange = false;
        var recGroupsChanged = false;

        return {
            resettingRecordings : function (startingReset) {
                if (inReset && !startingReset)
                    recordingsWereReset = true;
                inReset = startingReset;
            },

            recordingChange : function (change) {
                if (!inReset) {
                    if (!change.title)
                        change.title = "*";
                    if (!recChange[change.group])
                        recChange[change.group] = { };
                    recChange[change.group][change.title] = true;
                }
            },

            videoChange : function () {
                vidChange = true;
            },

            recGroupChange : function (grp) {
                console.log('logged a recording group change: ' + grp);
                recGroupsChanged = true;
            },

            frontendChange : function () {
                blast({ Frontends : Object.keys(frontends.byHost) });
            },

            sendChanges : function () {
                if (!inReset) {
                    if (recordingsWereReset) {
                        blast({ Recordings : true, Reset : true });
                        recordingsWereReset = false;
                    } else {
                        var rc = recChange;
                        var grpList = [ ];
                        for (var grp in recChange) {
                            var titleList = [ ];
                            for (var title in recChange[grp]) {
                                blast({ Recordings : true, Group : grp, Title : title});
                                titleList.push(title);
                            }
                            titleList.forEach(function (title) { delete rc[grp][title]; });
                        }
                        grpList.slice(2).forEach(function (grp) { if (rc[grp].length == 0) delete rc[grp]; });
                    }

                    if (recGroupsChanged) {
                        blast({ RecordingGroups : true })
                        recGroupsChanged = false;
                    }
                }

                if (vidChange) {
                    blast({ Videos : true });
                    vidChange = false;
                }
            }
        };
    })();


    // ////////////////////////////////////////////////////////////////////////
    // data model maintenance
    // ////////////////////////////////////////////////////////////////////////

    var mythMessageHandler = (function () {

        var addRecordingToRecGroup = function (recording, recGroup) {
            if (!byRecGroup[recGroup]) {
                byRecGroup[recGroup] = { };
                recGroups.push(recGroup);
                eventSocket.recGroupChange(recGroup);
            }
            var groupRecordings = byRecGroup[recGroup];
            if (!groupRecordings[recording.Title]) {
                groupRecordings[recording.Title] = [ ];
                eventSocket.recordingChange({ group : recGroup});
            }
            eventSocket.recordingChange({ group : recGroup, title : recording.Title});
            groupRecordings[recording.Title].push(recording);
        };

        var newRecording = function (recording) {
            if (!progTitles.hasOwnProperty(recording.Title)) {
                progTitles[recording.Title] = true;
                sortedTitles.push(recording.Title);
            }

            byFilename[recording.FileName] = recording;

            var chanKey = recording.Channel.ChanId + ' ' + localFromUTCString(recording.Recording.StartTs);
            byChanId[chanKey] = recording.FileName;

            addRecordingToRecGroup(recording, "All");
            addRecordingToRecGroup(recording, recording.Recording.RecGroup);
        };

        var delRecordingFromRecGroup = function (recording, recGroup) {
            if (byRecGroup.hasOwnProperty(recGroup) && byRecGroup[recGroup].hasOwnProperty(recording.Title)) {
                var episodes = byRecGroup[recGroup][recording.Title];
                for (var found = false, i = 0; !found && i < episodes.length; i++) {
                    if (episodes[i].FileName === recording.FileName) {
                        found = true;
                        episodes.remove(i);
                    }
                }
                eventSocket.recordingChange({ group : recGroup, title : recording.Title});
                if (episodes.length == 0) {
                    console.log('that was the last episode');
                    delete byRecGroup[recGroup][recording.Title];
                    eventSocket.recordingChange({ group : recGroup });
                    if (Object.keys(byRecGroup[recGroup]).length == 0) {
                        console.log('delete rec group ' + recGroup);
                        delete byRecGroup[recGroup];
                        eventSocket.recGroupChange(recGroup);
                    }
                }
            }
        };

        // new update events can come before we've processed the GetRecorded request
        var pendingRetrieves = { };

        var retrieveAndAddRecording = function (chanId, startTs) {
            if (!pendingRetrieves.hasOwnProperty(chanId + startTs)) {
                pendingRetrieves[chanId + startTs] = true;
                console.log('add new recording /Dvr/GetRecorded?ChanId=' + chanId + "&StartTime=" + startTs);
                reqJSON(
                    {
                        path : '/Dvr/GetRecorded?ChanId=' + chanId + "&StartTime=" + startTs
                    },
                    function (response) {
                        console.log('new recording');
                        console.log(response);
                        var recording = response.Program;
                        var startingTitleCount = sortedTitles.length;

                        console.log('new recording ' + recording.Title + ' ' + recording.SubTitle);
                        newRecording(recording);

                        if (sortedTitles.length > startingTitleCount)
                            sortedTitles.sort(titleCompare);

                        var title = recording.Title;
                        byRecGroup["All"][title].sort(episodeCompare);
                        byRecGroup[recording.Recording.RecGroup][title].sort(episodeCompare);

                        delete pendingRetrieves[chanId + startTs];
                        eventSocket.sendChanges();
                    });
            }
        };

        function deleteFromView(program) {
            // program has been expired or moved to Deleted group
            delete byFilename[program.FileName];
            delRecordingFromRecGroup(program, "All");
            delRecordingFromRecGroup(program, program.Recording.RecGroup);
            console.log('deleteFromView ' + program.StartTime + ' ' + program.Title);
            //console.log(program);
        }

        function deleteByChanId(chanKey) {
            if (byChanId.hasOwnProperty(chanKey)) {
                var fileName = byChanId[chanKey];
                if (byFilename.hasOwnProperty(fileName)) {
                    deleteFromView(byFilename[fileName]);
                }
                delete byChanId[chanKey];
            }
        }

        var recordingListChange = function (change, program) {
            if (change[0] === "ADD") {
                var chanId = change[1];
                var startTs = change[2];

                // event time is local, services time is UTC
                var startDate = new Date(Number(startTs.substr(0,4)), Number(startTs.substr(5,2))-1, Number(startTs.substr(8,2)), Number(startTs.substr(11,2)), Number(startTs.substr(14,2)), Number(startTs.substr(17,2)))
                startTs = toUTCString(startDate);

                retrieveAndAddRecording(chanId, startTs)
            }

            else if (change[0] === "UPDATE") {
                if (byFilename.hasOwnProperty(program.FileName)) {
                    var oldProg = byFilename[program.FileName];
                    if (program.Recording.RecGroup === "Deleted") {
                        deleteFromView(oldProg);
                    } else if (program.Recording.RecGroup !== oldProg.Recording.RecGroup) {
                        delRecordingFromRecGroup(oldProg, oldProg.Recording.RecGroup);
                        oldProg.Recording.RecGroup = program.Recording.RecGroup;
                        addRecordingToRecGroup(oldProg, program.Recording.RecGroup);
                        console.log('update rec group ' + oldProg.StartTime + ' ' + oldProg.Title +
                                    ' -> ' + program.Recording.RecGroup);
                        // console.log(program);
                    }
                } else {
                    if (program.Recording.RecGroup !== "Deleted") {
                        var unixStartTs = new Date(program.Recording.StartTs*1000);
                        var startTs = toUTCString(unixStartTs);
                        retrieveAndAddRecording(program.Channel.ChanId, startTs)
                    }
                }
            }

            else if (change[0] === "DELETE") {
                // deletes are typically handled with update's
                // change to recgroup = Deleted but here we handle
                // other delete paths such as expiry.
                var chanId = change[1], startTs = change[2];
                deleteByChanId(chanId + ' ' + startTs);
            }

            else {
                console.log('unhandled program change: ' + change);
                console.log(program);
            }
        };

        function init () {

            sortedTitles.forEach(function (title) {
                delete progTitles[title];
            });
            sortedTitles.length = 0;

            recGroups.forEach(function (groupName) {
                delete byRecGroup[groupName];
            });

            recGroups.length = 2;
            byRecGroup["All"] = [ ];
            byRecGroup["Default"] = [ ];

            eventSocket.recGroupChange("All");
            eventSocket.recGroupChange("Default");

            Object.keys(byFilename).forEach(function (fileName) {
                delete byFilename[fileName];
            });

            Object.keys(byVideoFolder).forEach(function (folder) {
                delete byVideoFolder[folder];
            });
            byVideoId.length = 0;

            reqJSON(
                {
                    path : '/Dvr/GetRecordedList'
                },
                function (pl) {
                    eventSocket.resettingRecordings(true);

                    pl.ProgramList.Programs.forEach(function (prog) {
                        newRecording(prog);
                    });

                    sortedTitles.sort(titleCompare);

                    if (recGroups.length > 3) {
                        var locals = recGroups.slice(2);
                        locals.sort(function (g1,g2) { return g1.toLowerCase() > g2.toLowerCase() ? 1 : -1; });
                        locals.forEach(function (recGoup, idx) {
                            recGroups[idx+2] = locals[idx];
                        });
                    }

                    recGroups.forEach(function (recGroup) {
                        Object.keys(byRecGroup[recGroup]).forEach(function (title) {
                            byRecGroup[recGroup][title].sort(episodeCompare);
                        });
                    });

                    eventSocket.resettingRecordings(false);
                    eventSocket.sendChanges();
                });

            Object.keys(byVideoFolder).forEach(function (folder) {
                delete byVideoFolder[folder];
            });

            reqJSON(
                {
                    path : '/Video/GetVideoList'
                },
                function (videos) {
                    byVideoFolder["/"] = { Title : "Videos", List : [ ] };
                    videos.VideoMetadataInfoList.VideoMetadataInfos.forEach(function (video) {
                        byVideoId[video.Id] = video;
                        byFilename[video.FileName] = video;
                        var curPath = "";
                        var curList = byVideoFolder["/"];
                        path.dirname(video.FileName).split(slashPattern).forEach(function (folder) {
                            if (folder !== ".") {
                                var newPath = curPath + "/" + folder;
                                var newList = byVideoFolder[newPath];
                                if (!newList) {
                                    newList = { Title : folder, List : [ ], VideoFolder : newPath };
                                    byVideoFolder[newPath] = newList;
                                    curList.List.push(newList);
                                }
                                curPath = newPath;
                                curList = newList;
                            }
                        });
                        curList.List.push(video);
                    });
                    Object.keys(byVideoFolder).forEach(function (path) {
                        byVideoFolder[path].List.sort(videoCompare);
                    });
                    eventSocket.videoChange();
                    eventSocket.sendChanges();
                });
        }

        var deleteRecording = function(info) {
        };


        var pullProgramInfo = function (message) {
            program = { };

            program.Title = message.shift();
            program.SubTitle = message.shift();
            program.Description = message.shift();
            if (backendProtocol >= "67") {
                program.Season = message.shift();
                program.Episode = message.shift();
            }
            program.Category = message.shift();
            program.Channel = { };
            program.Channel.ChanId = message.shift();
            program.Channel.ChanNum = message.shift();
            program.Channel.CallSign = message.shift();
            program.Channel.ChanName = message.shift();
            program.FileName = message.shift();
            program.FileSize = message.shift();
            program.StartTime = message.shift();
            program.EndTime = message.shift();
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
            program.Recording.StartTs = message.shift();
            program.Recording.EndTs = message.shift();
            program.ProgramFlags = message.shift();
            program.Recording.RecGroup = message.shift();
            program.OutputFilters = message.shift();
            program.SeriesId = message.shift();
            program.ProgramId = message.shift();
            if (backendProtocol >= "67") {
                program.Inetref = message.shift();
            }
            program.LastModified = message.shift();
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

            return program;
        };


        function handleMessage(message) {
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
                    console.log(event);
                    deleteByChanId(event.chanid + ' ' + event.starttime);
                }

                else if (event.name === "CLIENT_CONNECTED" ||
                    event.name === "CLIENT_DISCONNECTED" ||
                    event.name === "SCHEDULER_RAN" ||
                    event.name === "SCHEDULE_CHANGE" ||
                    event.name === "REC_PENDING" ||
                    event.name === "REC_STARTED" ||
                    event.name === "REC_FINISHED" ||
                    event.name === "REC_DELETED") {
                    console.log('Ignored System event:');
                    console.log(event);
                    // do nothing
                }

                else {
                    console.log('System event:');
                    console.log(event);
                }
            }

            else if (message[0].substr(0,20) === "SYSTEM_EVENT_RESULT ") {
            }

            else {
                var head = message[0].split(/[ ]/);
                var msgType = head[0];
                if (msgType === "RECORDING_LIST_CHANGE") {
                    var change = message.shift().substring(22).split(/[ ]/);
                    var changeType = change[0];
                    var program = pullProgramInfo(message);
                    console.log(change);
                    console.log(program);
                    recordingListChange(change,program);
                }

                else if (msgType === "UPDATE_FILE_SIZE" ||
                         msgType === "ASK_RECORDING" ||
                         msgType === "COMMFLAG_START" ||
                         msgType === "COMMFLAG_UPDATE" ||
                         msgType === "SCHEDULE_CHANGE") {
                }


                else {
                    console.log('Non system event:');
                    console.log(message);
                }
            }
        }

        return {
            init : init,
            handleMessage : handleMessage
        };

    })();


    // ////////////////////////////////////////////////////////////////////////
    // events from the backend
    // ////////////////////////////////////////////////////////////////////////

    function backendConnect(mythMessageHandler) {

        function mythCommand(args) {
            var cmd = args.join(' ');
            var buf = new Buffer(cmd);
            var len = new Buffer((cmd.length + "        ").substr(0,8));
            var cmdBuf = new Buffer(8 + buf.length);
            len.copy(cmdBuf);
            buf.copy(cmdBuf, 8);
            return cmdBuf;
        }

        var socket = new net.Socket();

        var heartbeatSeconds = 6;
        var lastConnect = new Date();

        function makeConnection() {
            console.log('open myth events connection ' + backend.host + ' ' + lastConnect.toString());
            socket.connect(6543, backend.host);
            lastConnect = new Date();
        }

        function doConnect() {
            if (myth.isUp && !myth.connectPending) {
                myth.connectPending = true;
                var msecToWait = (heartbeatSeconds * 1000) - ((new Date()).valueOf() - lastConnect.valueOf());
                if (msecToWait < 0) msecToWait = 0;
                setTimeout(makeConnection, msecToWait);
            }
        }

        var inPrefix = true;
        var needed = 8;

        var incomingLen = 0;
        var incoming = new Buffer(65535);

        socket.on('timeout', function () {
            console.log('myth event socket timeout/refresh');
            socket.write(mythCommand(["OK"]));
        });

        socket.on('close', function (hadError) {
            myth.connected = false;
            console.log('socket closed (withError: ' + hadError + ')');
            doConnect();
        });

        socket.on('end', function () {
            myth.connected = false;
            console.log('myth event socket end');
            doConnect();
        });

        socket.on('error', function (err) {
            console.log('myth event socket error');
            console.log(err);
            if (err.errno === 'ETIMEDOUT') {
                // probably the myth host is down
                myth.connected = false;
                myth.bonjourService.restart();
            }
        });

        socket.on('data', function(data) {

            data.copy(incoming, incomingLen);
            incomingLen += data.length;

            while (incomingLen >= needed) {

                var message = incoming.slice(0, needed).toString('utf8');
                if (needed < incomingLen)
                    incoming.copy(incoming, 0, needed, incomingLen);
                incomingLen -= needed;

                if (inPrefix) {
                    inPrefix = false;
                    needed = Number(message);
                } else {

                    inPrefix = true;
                    needed = 8;

                    var response = message.split(/\[\]:\[\]/);

                    if (response[0] === "BACKEND_MESSAGE") {
                        response.shift();
                        mythMessageHandler.handleMessage(response);
                    }

                    else if (response[0] === "ACCEPT") {
                        socket.write(mythCommand(["ANN", "Monitor", "MythExpress.EventListener", 1]));
                        mythMessageHandler.init();
                    }

                    else if (response[0] === "REJECT") {
                        backendProtocol = response[1];
                        if (mythProtocolTokens[backendProtocol]) {
                            doConnect();
                        } else {
                            console.log("Unknown protocol version '" + backendProtocol + "'");
                        }
                    }

                }
            }

            eventSocket.sendChanges();

        });

        socket.on('connect', function () {
            myth.connectPending = false;
            myth.connected = true;

            console.log('myth event socket connect');

            socket.setKeepAlive(true, heartbeatSeconds * 1000);
            socket.write(mythCommand(["MYTH_PROTO_VERSION", backendProtocol, mythProtocolTokens[backendProtocol]]));

        });

        doConnect();

    }


    // ////////////////////////////////////////////////////////////////////////
    // Bonjour
    // ////////////////////////////////////////////////////////////////////////

    myth.bonjourService = (function () {
        var backendBrowser = mdns.createBrowser(mdns.tcp('mythbackend'));

        backendBrowser.on('serviceUp', function(service) {
            //console.log("mythtv up: ", service.name);
            if (!myth.connected) {
                if (myth.affinity && myth.affinity !== service.host)
                    return;
                myth.isUp = true;
                var addr = filterIPv4(service.addresses);
                if (addr.length > 0) {
                    myth.bonjour = service;
                    myth.up = true;
                    backend.host = addr[0];
                    console.log(service.name + ': ' + backend.host);
                    backendConnect(mythMessageHandler);
                }
            }
        });

        backendBrowser.on('serviceDown', function(service) {
            //console.log("mythtv down: ", service.name);
            if (myth.connected) {
                myth.isUp = service.name === myth.bonjour.name;
            }
        });

        backendBrowser.start();

        var frontendBrowser = mdns.createBrowser(mdns.tcp('mythfrontend'));

        frontendBrowser.on('serviceUp', function(service) {
            //console.log("frontend up: ", service);
            var addr = filterIPv4(service.addresses);
            if (addr.length > 0) {
                service.ipv4 = addr[0];
                service.shortHost = hostFromService(service);
                frontends.byName[service.name] = service;
                frontends.byHost[service.shortHost] = { fullname : service.name, address : addr[0] };
                eventSocket.frontendChange();
            }
        });

        frontendBrowser.on('serviceDown', function(service) {
            //console.log("frontend down: ", service);
            if (frontends.byName.hasOwnProperty(service.name)) {
                var serv = frontends.byName[service.name];
                delete frontends.byHost[serv.shortHost];
                delete frontends.byName[serv.name];
                eventSocket.frontendChange();
            }
        });

        frontendBrowser.start();

        return {
            restart : function () {
                myth.up = false;
                Object(frontends.byName).keys().forEach(function (name) {
                    delete frontends.byHost[frontends.byName[name].shortHost];
                    delete frontends.byName[name];
                });

                backendBrowser.stop();
                backendBrowser.start();
                backendBrowser.stop();
                backendBrowser.start();
            }
        };
    })();


    // ////////////////////////////////////////////////////////////////////////
    // Frontend Control
    // ////////////////////////////////////////////////////////////////////////

    frontendControl = (function () {
        return {
            SendMessage : function (host, message) {
                if (frontends.byHost.hasOwnProperty(host)) {

                    var fe = frontends.byName[frontends.byHost[host].fullname];

                    (function (host) {
                        var socket = new net.Socket();
                        var reply = "";
                        socket.on('data', function (data) {
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
                        socket.connect(6546, host);
                    })(fe.ipv4);
                }
            }
        };
    })();

    // ////////////////////////////////////////////////////////////////////////
    // what routes see
    // ////////////////////////////////////////////////////////////////////////

    return {

        init : mythMessageHandler.init,
        byRecGroup : byRecGroup,
        byFilename : byFilename,
        sortedTitles : sortedTitles,
        recGroups : recGroups,

        byVideoFolder : byVideoFolder,
        byVideoId : byVideoId,


        StreamRecording : function (fileName, encoding, callback) {
            var recording = byFilename[fileName];

            console.log('Stream Recording');
            console.log(encoding);

            reqJSON(
                {
                    path : "/Content/AddRecordingLiveStream?ChanId=" + recording.Channel.ChanId + "&StartTime=" + recording.Recording.StartTs + "&Width=" + encoding.Width + "&Bitrate=" + encoding.Bitrate
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        StreamVideo : function (videoId, encoding, callback) {
            var video = byVideoId[videoId];

            console.log('Stream Video');
            console.log("/Content/AddVideoLiveStream?Id=" + video.Id);
            console.log(encoding);

            reqJSON(
                {
                    path : "/Content/AddVideoLiveStream?Id=" + video.Id
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        StopStream : function (StreamId) {
            reqJSON(
                {
                    path : "/Content/StopLiveStream?Id=" + StreamId
                },
                function (reply) {
                    console.log(reply);
                }
            );
        },


        StreamList : function (callback) {
            reqJSON(
                {
                    path : "/Content/GetLiveStreamList"
                },
                function (reply) {
                    callback(reply);
                }
            );
        },

        FilteredStreamList : function (fileName, callback) {
            reqJSON(
                {
                    path : "/Content/GetFilteredLiveStreamList?FileName=" + fileName
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        GetLiveStream : function (streamId, callback) {
            reqJSON(
                {
                    path : "/Content/GetLiveStream?Id=" + streamId
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        RemoveLiveStream : function (streamId, callback) {
            reqJSON(
                {
                    path : "/Content/RemoveLiveStream?Id=" + streamId
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        DecodeVideoProps : function (recording) {
            var props = { };
            if (recording.VideoProps & 1)
                props.HDTV = true;
            if (recording.VideoProps & 2)
                props.Widescreen = true;
            if (recording.VideoProps & 4)
                props.AVC = true;
            if (recording.VideoProps & 8)
                props["720"] = true;
            if (recording.VideoProps & 8)
                props["1080"] = true;
            return props;
        },


        MythServiceHost : function (request) {
            if (backend.customHost) {
                return backend.host + ":" + backend.port;
            } else {
                // use the client's path to us
                return request.headers.host.split(/:/)[0] + ":" + backend.port;
            }
        },

        GetFrontendList : function () {
            return Object.keys(frontends.byHost);
        },

        SendToFrontend : function (args) {
            var message;
            if (args.hasOwnProperty("FileName") && byFilename.hasOwnProperty(args.FileName)) {
                var prog = byFilename[args.FileName];
                message = "play program " + prog.Channel.ChanId + " " + localFromUTCString(prog.Recording.StartTs) + " resume";
            } else if (args.hasOwnProperty("VideoId") && byVideoId[args.VideoId]) {
                message = "play file myth://Videos/" + byVideoId[args.VideoId].FileName.toString("utf8").replace(/ /g, "%20");
            }
            if (message.length > 0) {
                frontendControl.SendMessage(args.Host, message);
            }
        }

    };

};