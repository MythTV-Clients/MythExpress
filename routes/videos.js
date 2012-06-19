
var slashPattern = /[/]/g;

app.get("/videos", function (req, res) {

    console.log("/videos");
    console.log(req.query);

    var folderName = req.query.Group || "/";

    var videoFolder = mythtv.byVideoFolder.hasOwnProperty(folderName)
        ? mythtv.byVideoFolder[folderName]
        : { Title : req.query.Group || "/", List : [ ] }

    req.Context.View = "Programs";
    req.Context.Title = folderName === "/"
        ? "Videos"
        : ("Videos" + folderName.replace(slashPattern, " / "));

    app.sendHeaders(req, res);

    res.render("videos", {
        url : url,
        MythBackend : mythtv.MythServiceHost(req),
        Title : req.Context.Title,
        Videos : videoFolder.List
    });
});


app.get("/videoinfo", function (req, res) {
    console.log("/videoinfo " + req.query.VideoId);
    res.partial("info/video", { video : mythtv.byVideoId[req.query.VideoId] });
});