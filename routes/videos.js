
app.get("/videos", function (req, res) {

    console.log("/videos");
    console.log(req.query);

    var videoFolder = mythtv.byVideoFolder[req.query.VideoFolder || "/"] ||
        { Title : req.query.VideoFolder || "/", Videos : [ ] }

    var partial = !!req.query.partial || !!req.query.VideoFolder;

    console.log('Video partial : ' + partial);

    res.render("videos", {
        layout : !partial,
        url : url,
        MythBackend : mythtv.MythServiceHost(req),
        RecGroups : mythtv.recGroups,
        Title : videoFolder.Title,
        Videos : videoFolder.List
    });
});


app.get("/videoinfo", function (req, res) {
    console.log("/videoinfo " + req.query.VideoId);
    res.partial("info/video", { video : mythtv.byVideoId[req.query.VideoId] });
});