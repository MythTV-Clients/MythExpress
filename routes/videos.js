
app.get("/videos", function (req, res) {

    console.log("/videos");
    console.log(req.query);

    var videoFolder = mythtv.byVideoFolder[req.query.VideoFolder || "/"];

    var partial = !!req.query.partial || !!req.query.VideoFolder;

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
    console.log("/recordinginfo " + req.query.FileName);
    res.partial("recording/description", { recording : mythtv.byFilename[req.query.FileName] });
});