
app.get("/watch/program", function (req, res) {
    if (req.query.hasOwnProperty("FileName") && mythtv.byFilename[req.query.FileName]) {
        var recording = mythtv.byFilename[req.query.FileName];
        var info = {
            Title : recording.Title,
            SubTitle : recording.SubTitle,
            Description : recording.Description
        };
        res.render("stream/play", {
            Info : info,
            FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetRecording?ChanId=" + recording.Channel.ChanId + "&StartTime=" + recording.Recording.StartTs
        });
    }

    else
        res.render("stream/missing", {
            programIsMissing : true,
            FileName : req.query.FileName
        });

});


app.get("/watch/video", function (req, res) {
    if (req.query.hasOwnProperty("VideoId") && mythtv.byVideoId[req.query.VideoId]) {
        var video = mythtv.byVideoId[req.query.VideoId];
        var info = {
            Title : video.Title,
            SubTitle : video.SubTitle,
            Description : video.Description
        };
        res.render("stream/play", {
            Info : info,
            FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetVideo?Id=" + video.Id
        });
    }

    else
        res.render("stream/missing", {
            programIsMissing : false,
            VideoId : req.query.VideoId
        });
});