
var http = require('http');
var path = require('path');
var net = require('net');

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

function mythCommand(args) {
    var cmd = "";
    args.forEach(function (arg) {
        cmd = cmd + " " + arg;
    });
    //console.log((cmd.length-1 + "        ").substr(0,8) + cmd.substr(1));
    return (cmd.length-1 + "        ").substr(0,8) + cmd.substr(1);
}

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
    var recGroups = [ ];

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
            });

            reply.on('end', function() {
                callback(JSON.parse(response.replace(/[\r\n]/g,'')));
                response = undefined;
            })
        });
        req.end();
    };

    var recordingListChange = function (change, program) {
        if (change[0] === "ADD") {
            var chanId = change[1];
            var startTs = change[2];
            console.log('add new recording ' + chanId + ' ' + startTs);
        }
        else if (change[0] === "UPDATE") {
            if (byFilename.hasOwnProperty(program.FileName)) {
                var oldProg = byFilename[program.FileName];
                if (program.Recording.RecGroup === "Deleted") {
                    delete byFilename[program.FileName];
                    ["All", oldProg.Recording.RecGroup].forEach(function (recGroup) {
                        var episodes = byRecGroup[recGroup][oldProg.Title];
                        for (var found = false, i = 0; !found && i < episodes.length; i++) {
                            if (episodes[i].FileName === oldProg.FileName) {
                                found = true;
                                episodes.remove(i);
                            }
                        }
                        if (episodes.length == 0) {
                            delete byRecGroup[recGroup][oldProg.Title];
                        }
                    });
                    console.log('update -> delete ' + oldProg.StartTime + ' ' + oldProg.Title);
                    //console.log(program);
                } else if (program.Recording.RecGroup !== oldProg.Recording.RecGroup) {
                    console.log('update');
                    console.log(program);
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
            var progTitles = { };
            pl.ProgramList.Programs.forEach(function (prog) {
                progTitles[prog.Title] = true;

                byFilename[prog.FileName] = prog;

                ["All", prog.Recording.RecGroup].forEach(function (recGroup) {
                    if (!byRecGroup[recGroup])
                        byRecGroup[recGroup] = { };
                    var groupRecordings = byRecGroup[recGroup];
                    if (!groupRecordings[prog.Title])
                        groupRecordings[prog.Title] = [ ];
                    groupRecordings[prog.Title].push(prog);
                });
            });

            sortedTitles.length = 0;
            for (var title in progTitles) {
                sortedTitles.push(title);
            }
            sortedTitles.sort(titleCompare);

            console.log('myth data loaded');

            recGroups.length = 0;
            Object.keys(byRecGroup).forEach(function (group) {
                recGroups.push(group);
            });
            recGroups.forEach(function (recGroup) {
                console.log('    ' + recGroup + ' ' + Object.keys(byRecGroup[recGroup]).length);
                Object.keys(byRecGroup[recGroup]).forEach(function (title) {
                    byRecGroup[recGroup][title].sort(episodeCompare);
                });
            });
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
    });

var deleteRecording = function(info) {
};


var BE = {

    protocolVersion : mythProtocolTokens.Latest,

    connect : function(callback) {
        var socket = net.connect(process.env["MX_PROTOCOL"] || 6543, backend.host, function() {
            socket.write(mythCommand(["MYTH_PROTO_VERSION", BE.protocolVersion, mythProtocolTokens[BE.protocolVersion]]));
        });

        var inPrefix = true;
        var needed = 8;
        var incoming = "";

        socket.on('data', function(data) {

            //console.log('[' + data.toString() + ']');
            incoming = incoming + data.toString();

            while (incoming.length >= needed) {

                var message = incoming.substr(0, needed);
                incoming = incoming.substr(needed);

                if (inPrefix) {
                    inPrefix = false;
                    needed = Number(message);
                } else {

                    inPrefix = true;
                    needed = 8;

                    var response = message.split(/\[\]:\[\]/);

                    if (false && response.length > 1 &&
                        !(response[1].substr(0,17) === "UPDATE_FILE_SIZE " ||
                          response[1].substr(0,30) === "SYSTEM_EVENT CLIENT_CONNECTED " ||
                          response[1].substr(0,33) === "SYSTEM_EVENT CLIENT_DISCONNECTED "
                         ))
                        console.log(response);
                    //console.log(message);

                    if (response[0] === "BACKEND_MESSAGE") {
                        response.shift();
                        callback(response);
                    }

                    else if (response[0] === "ACCEPT") {
                        socket.write(mythCommand(["ANN", "Monitor", "MythExpress", 1]));
                    }

                    else if (response[0] === "REJECT") {
                        BE.protocolVersion = Number(response[1]);
                        if (mythProtocolTokens[BE.protocolVersion]) {
                            BE.connect(callback);
                        } else {
                            console.log("Unknown protocol version '" + BE.protocolVersion + "'");
                        }
                    }

                }
            }

        });
    },

    pullProgramInfo : function (message) {
        program = { Channel : { }, Recording : { } };

        program.Title = message.shift();
        program.SubTitle = message.shift();
        program.Description = message.shift();
        if (this.protocolVersion >= 67) {
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
        if (this.protocolVersion >= 67) {
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
    }
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
            event.name === "REC_EXPIRED" ||
            event.name === "REC_DELETED") {
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
            var program = BE.pullProgramInfo(message);
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