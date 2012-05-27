
var http = require('http');
var path = require('path');
var net = require('net');
var WebSocketServer = require('ws').Server;
var fs = require('fs');

var mythProtocolTokens = {
    64 : "8675309J",
    65 : "D2BB94C2",
    66 : "0C0FFEE0",
    67 : "0G0G0G0",
    68 : "90094EAD",
    69 : "63835135",
    70 : "53153836",
    71 : "05e82186",
    72 : "D78EFD6F",
    73 : "D7FE8D6F",
    74 : "SingingPotato",
    "Latest" : 74
};
var mythProtocolVersion = mythProtocolTokens.Latest;


module.exports = function(args) {

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

    var toUTCString = function (localTs) {
        return localTs.getUTCFullYear() + "-" + ("0" + (localTs.getUTCMonth()+1)).substr(-2) + "-" + ("0" + localTs.getUTCDate()).substr(-2) + "T" + ("0" + localTs.getUTCHours()).substr(-2) + ":" + ("0" + localTs.getUTCMinutes()).substr(-2) + ":" + ("0" + localTs.getUTCSeconds()).substr(-2);
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
                callback(JSON.parse(response.replace(/[\r\n]/g,'')));
                //callback(JSON.parse(response));
                response = undefined;
            })
        });
        req.end();
    };

    var wss = new WebSocketServer({ host : '0.0.0.0', port : 6566 });
    wss.clients = [ ];
    wss.on('connection', function(ws) {
        console.log('new client (' + wss.clients.length + ')');
        ws.isAlive = true;
        ws.on('close', function () {
            ws.isAlive = false;
            console.log('ws client closed');
        });
        wss.clients.push(ws);
    });
    wss.blast = function(msg) {
        var msgStr = JSON.stringify(msg);
        console.log('blast ' + msgStr);
        wss.clients.forEach(function (webSocket) {
            if (webSocket.isAlive) {
                webSocket.send(msgStr);
            }
        });
    };

    var eventSocket = {

        recChange : { },
        recGroupsChanged : false,

        recordingChange : function (change) {
            if (!change.title)
                change.title = "*";
            if (!this.recChange[change.group])
                this.recChange[change.group] = { };
            this.recChange[change.group][change.title] = true;
        },

        videoChange : function (change) {
        },

        recGroupChange : function (grp) {
            console.log('logged a recording group change: ' + grp);
            this.recGroupsChanged = true;
        },

        sendChanges : function () {
            var rc = this.recChange;
            var grpList = [ ];
            for (var grp in this.recChange) {
                var titleList = [ ];
                for (var title in this.recChange[grp]) {
                    //console.log({ Recordings : true, Group : grp, Title : title});
                    wss.blast({ Recordings : true, Group : grp, Title : title});
                    titleList.push(title);
                }
                titleList.forEach(function (title) { delete rc[grp][title]; });
            }
            grpList.forEach(function (grp) { delete rc[grp]; });
            if (this.recGroupsChanged) {
                //console.log({ RecordingGroups : true })
                wss.blast({ RecordingGroups : true })
                this.recGroupsChanged = false;
            }
        }
    };

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
        } else {
            eventSocket.recordingChange({ group : recGroup, title : recording.Title});
        }
        groupRecordings[recording.Title].push(recording);
    };

    var newRecording = function (recording) {
        if (!progTitles.hasOwnProperty(recording.Title)) {
            progTitles[recording.Title] = true;
            sortedTitles.push(recording.Title);
        }

        byFilename[recording.FileName] = recording;

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
                });
        }
    };

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
                    delete byFilename[program.FileName];
                    delRecordingFromRecGroup(oldProg, "All");
                    delRecordingFromRecGroup(oldProg, oldProg.Recording.RecGroup);
                    console.log('update -> delete ' + oldProg.StartTime + ' ' + oldProg.Title);
                    //console.log(program);
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
            // already handled with update's change to recgroup = Deleted
        }
        else {
            console.log('unhandled program change: ' + change);
            console.log(program);
        }
    };

    reqJSON(
        {
            path : '/Dvr/GetRecordedList'
        },
        function (pl) {
            progTitles.length = 0;
            sortedTitles.length = 0;

            recGroups.length = 0;
            recGroups.push("All");
            recGroups.push("Default");
            byRecGroup.length = 0;
            byRecGroup["All"] = [ ];
            byRecGroup["Default"] = [ ];

            pl.ProgramList.Programs.forEach(function (prog) {
                newRecording(prog);
            });

            sortedTitles.sort(titleCompare);

            recGroups.forEach(function (recGroup) {
                console.log('    ' + recGroup + ' ' + Object.keys(byRecGroup[recGroup]).length);
                Object.keys(byRecGroup[recGroup]).forEach(function (title) {
                    byRecGroup[recGroup][title].sort(episodeCompare);
                });
            });

            console.log('myth data loaded');
            eventSocket.sendChanges();
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
                path.dirname(video.FileName).split(/[/]/).forEach(function (folder) {
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
        console.log(Object.keys(byVideoFolder).length + " video folders");
        eventSocket.sendChanges();
    });

var deleteRecording = function(info) {
};


var BE = (function () {

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
    var messageHandler;

    var heartbeatSeconds = 6;
    var lastConnect = new Date();
    var connectPending = false;

    function makeConnection() {
        socket.connect(process.env["MX_PROTOCOL"] || 6543, backend.host);
        lastConnect = new Date();
        connectPending = false;
        console.log('open myth events connection ' + lastConnect.toString());
    }

    var doConnect = function() {
        if (!connectPending) {
            connectPending = true;
            var msecToWait = (heartbeatSeconds * 1000) - ((new Date()).valueOf() - lastConnect.valueOf());
            if (msecToWait < 0) msecToWait = 0;
            setTimeout(makeConnection, msecToWait);
        }
    };

    var inPrefix = true;
    var needed = 8;

    var incomingLen = 0;
    var incoming = new Buffer(65535);

    socket.on('timeout', function () {
        console.log('myth event socket timeout/refresh');
        socket.write(mythCommand(["OK"]));
    });

    socket.on('close', function (hadError) {
        console.log('socket closed (withError: ' + hadError + ')');
        doConnect();
    });

    socket.on('end', function () {
        console.log('myth event socket end');
        doConnect();
    });

    socket.on('error', function (err) {
        console.log('myth event socket error');
        console.log(err);
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
                    messageHandler(response);
                }

                else if (response[0] === "ACCEPT") {
                    socket.write(mythCommand(["ANN", "Monitor", "MythExpress", 1]));
                }

                else if (response[0] === "REJECT") {
                    mythProtocolVersion = Number(response[1]);
                    if (mythProtocolTokens[mythProtocolVersion]) {
                        doConnect();
                    } else {
                        console.log("Unknown protocol version '" + mythProtocolVersion + "'");
                    }
                }

            }
        }

        eventSocket.sendChanges();

    });

    socket.on('connect', function () {
        console.log('myth event socket connect');

        socket.setKeepAlive(true, heartbeatSeconds * 1000);
        socket.write(mythCommand(["MYTH_PROTO_VERSION", mythProtocolVersion, mythProtocolTokens[mythProtocolVersion]]));

    });

    return {
        connect : function(callback) {
            messageHandler = callback;
            doConnect();
        }
    };
})();

var pullProgramInfo = function (message) {
    program = { Channel : { }, Recording : { } };

    program.Title = message.shift();
    program.SubTitle = message.shift();
    program.Description = message.shift();
    if (mythProtocolVersion >= 67) {
        program.Season = message.shift();
        program.Episode = message.shift();
    }
    program.Category = message.shift();
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
    if (mythProtocolVersion >= 67) {
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

BE.connect(function(message) {
    if (message[0].substr(0,13) === "SYSTEM_EVENT ") {
        var args = message[0].split(/ /);
        args.shift();
        var event = { };
        event.name = args.shift();
        while (args.length > 0) {
            var data = args.shift();
            event[data.toLowerCase()] = args.shift();
        }

        if (event.name === "CLIENT_CONNECTED" ||
            event.name === "CLIENT_DISCONNECTED" ||
            event.name === "SCHEDULER_RAN" ||
            event.name === "SCHEDULE_CHANGE" ||
            event.name === "REC_PENDING" ||
            event.name === "REC_STARTED" ||
            event.name === "REC_FINISHED" ||
            //event.name === "REC_EXPIRED" ||
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
});

    return {

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
        }

    };

};