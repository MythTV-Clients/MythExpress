
var slashPattern = /[/]/g;

app.get("/videos", MX, function (req, res) {

    console.log("/videos");
    console.log(req.query);

    var folderName = req.query.Group || "/";

    var videoFolder = mythtv.byVideoFolder.hasOwnProperty(folderName)
        ? mythtv.byVideoFolder[folderName]
        : { Title : req.query.Group || "/", List : [ ] }

    res.local("Context").View = "Programs";
    res.local("Context").Group = folderName;
    res.local("Context").Title = folderName === "/"
        ? "Videos"
        : ("Videos" + folderName.replace(slashPattern, " / "));

    app.sendHeaders(req, res);

    res.render("videos", {
        url : url,
        MythBackend : mythtv.MythServiceHost(req),
        Title : res.local("Context").Title,
        Videos : videoFolder.List,
        fileHasStream : mythtv.fileHasStream
    });
});


app.get("/videoinfo", function (req, res) {
    console.log("/videoinfo " + req.query.VideoId);
    res.partial("info/video", {
        mythtv      : mythtv,
        MythBackend : mythtv.MythServiceHost(req),
        video       : mythtv.byVideoId[req.query.VideoId]
    });
});
