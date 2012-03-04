
app.get("/recordings", function (req, res) {

    console.log(req.query);

    var recGroup = req.query.RecGroup || "Default";

    if (req.query.Title) {

        res.render("episodes", {
            layout : false,
            MythBackend : mythtv.MythServiceHost(req),
            Recordings : mythtv.byRecGroup[recGroup][req.query.Title]
        });

    } else {

        var groupTitles = mythtv.byRecGroup[recGroup];
        var programList = [ ];
        mythtv.sortedTitles.forEach(function (title) {
            if (groupTitles[title])
                programList.push(groupTitles[title]);
        });

        res.render("recordings", {
            layout : !req.query.RecGroup,
            MythBackend : mythtv.MythServiceHost(req),
            Title : "MythTV Recordings",
            RecGroups : mythtv.recGroups,
            Recordings : programList
        });

    }
});


app.get("/recordinginfo", function (req, res) {
    console.log("/recordinginfo " + req.query.FileName);
    res.partial("info/recording", { recording : mythtv.byFilename[req.query.FileName] });
});