
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