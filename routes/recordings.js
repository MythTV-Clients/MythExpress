
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

        var programList = [ ];
        if (mythtv.sortedTitles.hasOwnProperty(recGroup)) {
            mythtv.sortedTitles[recGroup].forEach(function (title) {
                programList.push(mythtv.byRecGroup[recGroup][title]);
            });
        }

        res.render("recordings", {
            layout : !req.query.RecGroup,
            MythBackend : mythtv.MythServiceHost(req),
            Title : "MythTV Recordings",
            RecGroups : mythtv.viewButtons.Programs,
            Recordings : programList
        });

    }
});


app.get("/recordinginfo", function (req, res) {
    var program = mythtv.byFilename[req.query.FileName];

    var flags = [ ];
    if (program.hasOwnProperty("ProgramFlags_")) {
        Object.keys(program.ProgramFlags_).forEach(function (flag) {
            if (program.ProgramFlags_[flag])
                flags.push(flag);
        });
    }

    res.partial("info/recording", {
        recording : program,
        flags : flags.join(' ')
    });
});