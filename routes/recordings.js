
function doRender(req, res, headerData) {

    console.log(req.query);

    var locals = {
        MythBackend : mythtv.MythServiceHost(req),
        RecGroup : req.query.Group,
        Recordings : undefined
    };

    var recGroup = req.query.Group;
    var jadeFile;

    if (req.query.hasOwnProperty("Title")) {

        jadeFile = "episodes";

        locals.Recordings = mythtv.byRecGroup[recGroup].hasOwnProperty(req.query.Title)
            ? mythtv.byRecGroup[recGroup][req.query.Title]
            : [ ];

        req.Context.Title = recGroup + " \u2022 " + req.query.Title;

    } else {

        jadeFile = "recordings";

        locals.Recordings = [ ];
        (mythtv.sortedTitles[recGroup] || [ ]).forEach(function (title) {
            locals.Recordings.push(mythtv.byRecGroup[recGroup][title]);
        });

        req.Context.Title = (recGroup || "No") + (req.Context.View === "Programs" ? " Recording Group" : " Recordings");

    }

    app.sendHeaders(req, res);
    res.render(jadeFile, locals);

}


app.get("/recordings", function (req, res) {
    // return "Default" or "Recordings" depending if there are >1 groups
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = mythtv.groupNames.length > 1 ? mythtv.groupNames[1] : mythtv.groupNames[0];

    if (!req.Context.hasOwnProperty("View"))
        req.Context.View = "Programs";
    if (!req.Context.hasOwnProperty("Group"))
        req.Context.Group = req.query.Group;

    doRender(req, res);
});


app.get("/properties", function (req, res) {
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = mythtv.traitNames[0];

    req.Context.View = "Properties";
    req.Context.Group = req.query.Group;

    doRender(req, res);
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