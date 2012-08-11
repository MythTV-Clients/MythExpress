
app.get("/watch", MX, function (req, res) {
    if (req.query.hasOwnProperty("FileName")) {
        if (mythtv.byFilename[req.query.FileName]) {

            var recording = mythtv.byFilename[req.query.FileName];
            var info = recording;

            res.local("Context").Title = recording.Title;
            app.sendHeaders(req, res);

            res.partial("stream/play", {
                Info : info,
                FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetRecording?ChanId=" + recording.Channel.ChanId + "&StartTime=" + recording.Recording.StartTs,
                mythtv : mythtv
            });

        } else {

            res.partial("stream/missing", {
                programIsMissing : true,
                FileName : req.query.FileName
            });

        }
    }

    else if (req.query.hasOwnProperty("VideoId")) {
        if (mythtv.byVideoId[req.query.VideoId]) {

            var video = mythtv.byVideoId[req.query.VideoId];
            var info = {
                Title : video.Title,
                SubTitle : video.SubTitle,
                Description : video.Description
            };

            res.local("Context").Title = video.Title;
            app.sendHeaders(req, res);

            res.partial("stream/play", {
                Info : info,
                FullURL : "http://" + mythtv.MythServiceHost(req) + "/Content/GetVideo?Id=" + video.Id,
                mythtv : mythtv
            });
        }

    } else {

        res.partial("stream/missing", {
            programIsMissing : false,
            VideoId : req.query.VideoId
        });

    }
});
