
var slashPattern = /[/]/g;

app.get("/videos", MX, function (req, res) {

    log.info("/videos");
    log.info(req.query);

    var mythtv = app.mythtv;

    var folderName = req.query.Group || "/";

    var videoFolder = mythtv.byVideoFolder.hasOwnProperty(folderName)
        ? mythtv.byVideoFolder[folderName]
        : { Title : req.query.Group || "/", List : [ ] }

    res.locals.Context.View = "Programs";
    res.locals.Context.Group = folderName;
    res.locals.Context.Title = folderName === "/"
        ? "Videos"
        : ("Videos" + folderName.replace(slashPattern, " / "));

    app.sendHeaders(req, res);

    res.render(req.xhr ? "videos" : "layout", {
        url : url,
        MythBackend : mythtv.MythServiceHost(req),
        Title : res.locals.Context.Title,
        Videos : videoFolder.List,
        fileHasStream : mythtv.fileHasStream
    });
});


app.get("/videoinfo", function (req, res) {
    log.info("/videoinfo " + req.query.VideoId);
    var mythtv = app.mythtv;
    res.render("info/video", {
        mythtv      : mythtv,
        MythBackend : mythtv.MythServiceHost(req),
        video       : mythtv.byVideoId[req.query.VideoId]
    });
});
