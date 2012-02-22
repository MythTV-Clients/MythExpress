// 'user-agent':
// Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/534.52.7 (KHTML, like Gecko) Version/5.1.2 Safari/534.52.7
// Mozilla/5.0 (iPad; CPU OS 5_0_1 like Mac OS X) AppleWebKit/534.46 (KHTML, like Gecko) Version/5.1 Mobile/9A405 Safari/7534.48.3

app.get("/streams", function (req, res) {

    console.log("/streams");
    console.log(req.query);

    if (req.query.FullURL) {
        // request to see an in-progress stream
        req.query.layout = false;
        res.render("stream/index", req.query);
    }

    else if (req.query.Play) {
        // requesting the raw video
        res.render("stream/play", {
            layout : false,
            FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetRecording?ChanId=" + req.query.ChanId + "&StartTime=" + req.query.StartTs
        });
    }

    else if (req.query.FileName) {
        // requesting a new stream
        var recording = mythtv.byFilename[req.query.FileName];
        var props = mythtv.DecodeVideoProps(recording);

        var encoding = { Width:  640, Bitrate: 1240000 };

        // there must be a better way!
        if (req.headers['user-agent'].match(/iPad/)) {
            if (props.HDTV || props.Widescreen) {
                if (props["720p"])
                    encoding = { Aspect: "16:9", Width: 1280, Bitrate: 1500000 };
                if (props["1080p"])
                    encoding = { Aspect: "16:9", Width: 1280, Bitrate: 4500000 };
            } else {
                encoding = { Aspect: "4:3",  Width:  640, Bitrate: 1240000 };
                if (props["720p"])
                    encoding = { Aspect: "4:3", Width: 960, Bitrate: 2500000 };
                if (props["1080p"])
                    encoding = { Aspect: "4:3", Width: 1280, Bitrate: 4500000 };
            }
        }

        else {
            if (props.HDTV || props.Widescreen) {
                if (props["720p"])
                    encoding = { Aspect: "16:9", Width: 1280, Bitrate: 1500000 };
                if (props["1080p"])
                    encoding = { Aspect: "16:9", Width: 1280, Bitrate: 4500000 };
            } else {
                encoding = { Aspect: "4:3",  Width:  640, Bitrate: 1240000 };
                if (props["720p"])
                    encoding = { Aspect: "4:3", Width: 960, Bitrate: 2500000 };
                if (props["1080p"])
                    encoding = { Aspect: "4:3", Width: 1280, Bitrate: 4500000 };
            }
        }

        console.log('encoding parameters from props ' + recording.VideoProps);
        console.log(props);
        console.log(encoding);

        mythtv.StreamRecording(req.query.FileName, encoding, function (reply) {
            console.log('Streaming reply:');
            console.log(reply);

            var sourceFile = reply.LiveStreamInfo.SourceFile.replace(/^.*[/]/, "");

            res.partial("stream/wait", { StreamId : reply.LiveStreamInfo.Id });

            if (false) {
                res.render("stream/index", {
                    layout : false,
                    FullURL : reply.LiveStreamInfo.FullURL,
                    Width : reply.LiveStreamInfo.Width,
                    Height : reply.LiveStreamInfo.Height
                });
            }
        });
    }

    else {

        mythtv.StreamList(function (reply) {
            //console.log('Streamlist reply:');
            //console.log(reply.LiveStreamInfoList.LiveStreamInfos[0]);

            reply.LiveStreamInfoList.LiveStreamInfos.forEach(function(stream) {
                var sourceFile = stream.SourceFile.replace(/^.*[/]/, "");
                if (!!mythtv.byFilename[sourceFile])
                    stream.Recording = mythtv.byFilename[sourceFile];
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


app.get("/streamstatus", function (req, res) {
    mythtv.StreamList(function (reply) {
        //console.log('Streamlist reply:');
        //console.log(reply.LiveStreamInfoList.LiveStreamInfos[0]);

        var streams = [ ];

        reply.LiveStreamInfoList.LiveStreamInfos.forEach(function(stream) {
            var sourceFile = stream.SourceFile.split("/").pop();
            if (!!mythtv.byFilename[sourceFile])
                stream.Recording = mythtv.byFilename[sourceFile];
            res.render("stream", { layout : false, stream : stream, MythBackend : mythtv.MythServiceHost(req) },
                       function (err,html) {
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


app.get("/streamplayer", function (req, res) {
    //console.log("/streamplayer " + req.query.StreamId);
    mythtv.GetLiveStream(req.query.StreamId, function (reply) {
        //console.log(reply);
        if (Number(reply.LiveStreamInfo.SegmentCount) > 2) {
            res.partial("stream/play", {
                FullURL : reply.LiveStreamInfo.FullURL,
                Width : reply.LiveStreamInfo.Width,
                Height : reply.LiveStreamInfo.Height
            });
        } else {
            res.partial("stream/empty");
        }
    });
});


app.get("/streaminfo", function (req, res) {
    console.log("/streaminfo " + req.query.StreamId);
    mythtv.GetLiveStream(req.query.StreamId, function (reply) {
        console.log(reply);
        var stream = reply.LiveStreamInfo;
        var sourceFile = stream.SourceFile.replace(/^.*[/]/, "");
        if (!!mythtv.byFilename[sourceFile])
            stream.Recording = mythtv.byFilename[sourceFile];
        res.partial("stream/description", { stream : stream });
    });
});


app.get("/deletestream", function (req, res) {
    console.log("/deletestream " + req.query.StreamId);
    mythtv.RemoveLiveStream(req.query.StreamId, function (reply) {
        console.log(reply);
        res.partial("stream/empty");
    });
});