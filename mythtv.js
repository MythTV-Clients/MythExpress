
var http = require('http');
var path = require('path');

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

    var programList = [ ];    // all programs as returned by myth + a sequence number (array pos) added during load

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



    reqJSON(
        {
            path : '/Dvr/GetRecordedList'
        },
        function (pl) {
            var progTitles = { };
            programList.length = 0;
            pl.ProgramList.Programs.forEach(function (prog) {
                prog.seq = programList.length;
                programList.push(prog);

                progTitles[prog.Title] = true;

                byFilename[prog.FileName] = prog;

                if (!byRecGroup[prog.Recording.RecGroup])
                    byRecGroup[prog.Recording.RecGroup] = { };

                var recGroup = byRecGroup[prog.Recording.RecGroup];
                if (!recGroup[prog.Title])
                    recGroup[prog.Title] = [ ];
                recGroup[prog.Title].push(prog);

                if (!byRecGroup.All[prog.Title])
                    byRecGroup.All[prog.Title] = [ ];
                byRecGroup.All[prog.Title].push(prog);
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