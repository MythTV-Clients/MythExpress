// 'user-agent':
// Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/534.52.7 (KHTML, like Gecko) Version/5.1.2 Safari/534.52.7
// Mozilla/5.0 (iPad; CPU OS 5_0_1 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9A405 Safari/7534.48.3

function normalizeMetadata(req, stream) {
    // metadata comes with relative filepaths while streamdata comes
    // with full paths so we peel folders off the front until we get
    // a hit... or not
    for (var fileParts = stream.SourceFile.split("/");
         fileParts.length > 0 && !mythtv.byFilename[fileParts.join("/")];
         fileParts.shift())
    { }
    var sourceFile = fileParts.join("/");
    if (!!mythtv.byFilename[sourceFile]) {
        stream.Info = mythtv.byFilename[sourceFile];
        if (!!stream.Info.StartTime) {
            stream.Image = "http://"+ mythtv.MythServiceHost(req) + "/Content/GetPreviewImage?ChanId="
                + stream.Info.Channel.ChanId + "&StartTime=" + stream.Info.Recording.StartTs + "&Width=128"
        } else {
            if (!!stream.Info.Coverart)
                stream.Image = "http://"+ mythtv.MythServiceHost(req)
                + "/Content/GetImageFile?StorageGroup=Coverart&FileName=" + stream.Info.Coverart + "&Width=128";
        }
    }
}


function renderPlayerControl(req, res, stream) {
    normalizeMetadata(req, stream);
    res.partial("stream/play", {
        FullURL : stream.FullURL,
        Width : stream.Width,
        Height : stream.Height,
        Info : stream.Info
    });
}


function renderPlayerForStream(req, res, streamId, waitForSegments) {
    mythtv.GetLiveStream(streamId, function(reply) {
        var stream = reply.LiveStreamInfo;
        if (waitForSegments && Number(stream.SegmentCount) < 3) {
            res.partial("stream/empty");
        } else {
            renderPlayerControl(req, res, stream);
        }
    });
}


function renderIfStreamExists(req, res, fileName, noStreamCallback) {
    mythtv.FilteredStreamList(fileName, function(reply) {
        if (reply.LiveStreamInfoList.LiveStreamInfos.length == 0) {
            noStreamCallback();
        } else {
            renderPlayerControl(req, res, reply.LiveStreamInfoList.LiveStreamInfos[0]);
        }
    });
}


app.get("/streams", function(req, res) {

    console.log("/streams");
    console.log(req.query);

    if (req.query.StreamId) {
        renderPlayerForStream(req, res, req.query.StreamId);
    }

    else if (req.query.FileName) {
        renderIfStreamExists(req, res, req.query.FileName, function() {
            // requesting a new stream
            var recording = mythtv.byFilename[req.query.FileName];
            var props = mythtv.DecodeVideoProps(recording);

            //var encoding = { Width:  960, Bitrate: 1480000 };
            //var encoding = { Width:  800, Bitrate: 1360000 };
            var encoding = { Width:  720, Bitrate: 1360000 };

            //var encoding = { Width:  640, Bitrate: 1240000 };
            //
            // there must be a better way!
            // if (req.headers['user-agent'].match(/iPad/)) {
            //     if (props.HDTV || props.Widescreen) {
            //         if (props["720p"])
            //             encoding = { Aspect: "16:9", Width: 1280, Bitrate: 1500000 };
            //         if (props["1080p"])
            //             encoding = { Aspect: "16:9", Width: 1280, Bitrate: 4500000 };
            //     } else {
            //         encoding = { Aspect: "4:3",  Width:  640, Bitrate: 1240000 };
            //         if (props["720p"])
            //             encoding = { Aspect: "4:3", Width: 960, Bitrate: 2500000 };
            //         if (props["1080p"])
            //             encoding = { Aspect: "4:3", Width: 1280, Bitrate: 4500000 };
            //     }
            // }

            // else {
            //     if (props.HDTV || props.Widescreen) {
            //         if (props["720p"])
            //             encoding = { Aspect: "16:9", Width: 1280, Bitrate: 1500000 };
            //         if (props["1080p"])
            //             encoding = { Aspect: "16:9", Width: 1280, Bitrate: 4500000 };
            //     } else {
            //         encoding = { Aspect: "4:3",  Width:  640, Bitrate: 1240000 };
            //         if (props["720p"])
            //             encoding = { Aspect: "4:3", Width: 960, Bitrate: 2500000 };
            //         if (props["1080p"])
            //             encoding = { Aspect: "4:3", Width: 1280, Bitrate: 4500000 };
            //     }
            // }

            console.log('encoding parameters from props ' + recording.VideoProps);
            console.log(props);
            console.log(encoding);

            mythtv.StreamRecording(req.query.FileName, encoding, function(reply) {
                console.log('Streaming reply:');
                console.log(reply);

                res.partial("stream/wait", { StreamId : reply.LiveStreamInfo.Id });
            });
        });
    }

    else if (req.query.VideoId) {

        var video = mythtv.byVideoId[req.query.VideoId];

        renderIfStreamExists(req, res, video.FileName, function() {
            var encoding = { Width:  640, Bitrate: 1240000 };

            mythtv.StreamVideo(video.Id, encoding, function(reply) {
                console.log('Streaming reply:');
                console.log(reply);

                res.partial("stream/wait", { StreamId : reply.LiveStreamInfo.Id });
            });
        });
    }

    else {

        mythtv.StreamList(function(reply) {
            reply.LiveStreamInfoList.LiveStreamInfos.forEach(function(stream) {
                normalizeMetadata(req, stream);
            });

            res.render("streams", {
                layout : Object.keys(req.query).length == 0,
                MythBackend : mythtv.MythServiceHost(req),
                Title : "MythTV Streams",
                RecGroups : mythtv.recGroups,
                LiveStreamInfos : reply.LiveStreamInfoList.LiveStreamInfos
            });
        });

    }

});


app.get("/streamstatus", function(req, res) {
    mythtv.StreamList(function(reply) {
        var streams = [ ];

        reply.LiveStreamInfoList.LiveStreamInfos.forEach(function(stream) {
            normalizeMetadata(req, stream);
            res.render("stream", { layout : false, stream : stream, MythBackend : mythtv.MythServiceHost(req) },
                       function(err,html) {
                           if (err) {
                               console.log(err);
                           } else {
                               streams.push(html);
                           }
                       });
        });

        res.json(streams);
    });
});


app.get("/streamplayer", function(req, res) {
    renderPlayerForStream(req, res, req.query.StreamId, true);
    // true = delay video control until enough segments are encoded
});


app.get("/streaminfo", function(req, res) {
    console.log("/streaminfo " + req.query.StreamId);
    mythtv.GetLiveStream(req.query.StreamId, function(reply) {
        console.log(reply);
        var stream = reply.LiveStreamInfo;
        normalizeMetadata(req, stream);
        res.partial("stream/description", { stream : stream });
    });
});


app.get("/deletestream", function(req, res) {
    mythtv.RemoveLiveStream(req.query.StreamId, function(reply) {
        res.partial("stream/empty");
    });
});