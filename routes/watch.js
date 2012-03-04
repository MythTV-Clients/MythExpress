
app.get("/watch/file/:fileName", function (req, res) {
    console.log("/watch/file");
    console.log(req.params);

    if (req.params.hasOwnProperty("fileName") && mythtv.byFilename[req.params.fileName]) {
        var recording = mythtv.byFilename[req.params.fileName];
        res.render("watch/recording", {
            Title : recording.Title,
            SubTitle : recording.SubTitle,
            Description : recording.Description,
            FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetRecording?ChanId=" + recording.Channel.ChanId + "&StartTime=" + recording.Recording.StartTs
        });
    }

    else
        res.redirect("/recordings");
});


app.get("/watch/video/:videoId", function (req, res) {
    console.log("/watch/video");
    console.log(req.params);

    if (req.params.hasOwnProperty("videoId") && mythtv.byVideoId[req.params.videoId]) {
        var video = mythtv.byVideoId[req.params.videoId];
        res.render("watch/video", {
            Title : video.Title,
            SubTitle : video.SubTitle,
            Description : video.Description,
            FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetVideo?Id=" + video.Id
        });
    }

    else
        res.redirect("/videos");
});