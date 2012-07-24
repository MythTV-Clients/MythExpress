
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

        res.local("Context").Title = recGroup + " \u2022 " + req.query.Title;

    } else {

        jadeFile = "recordings";

        locals.Recordings = [ ];
        (mythtv.sortedTitles[recGroup] || [ ]).forEach(function (title) {
            locals.Recordings.push(mythtv.byRecGroup[recGroup][title]);
        });

        res.local("Context").Title = (recGroup || "No") + (res.local("Context").View === "Programs" ? " Recording Group" : " Recordings");

    }

    // console.log("dorender with locals() and locals:");
    // console.log(res._locals);
    // console.log(locals);

    app.sendHeaders(req, res);
    res.render(jadeFile, locals);

}


app.get("/recordings", MX, function (req, res) {
    // return "Default" or "Recordings" depending if there are >1 groups
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = mythtv.groupNames.length > 1 ? mythtv.groupNames[1] : mythtv.groupNames[0];

    if (!res.local("Context").hasOwnProperty("View"))
        res.local("Context").View = "Programs";
    if (!res.local("Context").hasOwnProperty("Group"))
        res.local("Context").Group = req.query.Group;

    doRender(req, res);
});


app.get("/properties", MX, function (req, res) {
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = mythtv.traitNames[0];

    res.local("Context").View = "Properties";
    res.local("Context").Group = req.query.Group;

    doRender(req, res);
});


app.get("/deleterecording", function (req, res) {
    mythtv.RemoveRecording(req.query.ChanId, req.query.StartTs, function (reply) {
        console.log("Reply from /Dvr/RemoveRecorded?ChanId=" + req.query.ChanId + "&StartTime=" + req.query.StartTs);
        console.log(reply);
        if (!reply.bool) {
            mythtv.blast({
                Alert : true,
                Category : "Recording Delete",
                Class : "Alert",
                Message : "Delete failed",
                Decay : 3
            }, req.cookies.mythexpress);
        }
    });

    res.writeHead(200);
    res.end();
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
        mythtv      : mythtv,
        MythBackend : mythtv.MythServiceHost(req),
        recording   : program,
        flags       : flags.join(' ')
    });
});
