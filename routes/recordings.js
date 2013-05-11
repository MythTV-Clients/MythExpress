
function doRender(req, res, headerData) {

    log.info(req.query);

    var mythtv = app.mythtv;

    var locals = {
        MythBackend : mythtv.MythServiceHost(req),
        RecGroup : req.query.Group,
        Recordings : undefined,
        fileHasStream : mythtv.fileHasStream
    };

    var recGroup = req.query.Group;
    var jadeFile;

    if (req.query.hasOwnProperty("Title")) {

        jadeFile = "episodes";

        locals.Recordings = mythtv.byRecGroup.hasOwnProperty(recGroup) && mythtv.byRecGroup[recGroup].hasOwnProperty(req.query.Title)
            ? mythtv.byRecGroup[recGroup][req.query.Title]
            : [ ];

        res.locals.Context.Title = recGroup + " \u2022 " + req.query.Title;

    } else {

        jadeFile = "recordings";

        locals.Recordings = [ ];
        (mythtv.sortedTitles[recGroup] || [ ]).forEach(function (title) {
            locals.Recordings.push(mythtv.byRecGroup[recGroup][title]);
        });

        res.locals.Context.Title = (recGroup || "No") + (res.locals.Context.View === "Programs" ? " Recording Group" : " Recordings");

    }

    // log.info("dorender with locals() and locals:");
    // log.info(res._locals);
    // log.info(locals);

    app.sendHeaders(req, res);
    res.render(req.xhr ? jadeFile : "layout", locals);

}


app.get("/recordings", MX, function (req, res) {
    var mythtv = app.mythtv;
    // return "Default" or "Recordings" depending if there are >1 groups
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = mythtv.groupNames.length > 1 ? mythtv.groupNames[1] : mythtv.groupNames[0];

    if (!res.locals.Context.hasOwnProperty("View"))
        res.locals.Context.View = "Programs";
    if (!res.locals.Context.hasOwnProperty("Group"))
        res.locals.Context.Group = req.query.Group;

    doRender(req, res);
});


app.get("/properties", MX, function (req, res) {
    if (!req.query.hasOwnProperty("Group"))
        req.query.Group = app.mythtv.traitNames[0];

    res.locals.Context.View = "Properties";
    res.locals.Context.Group = req.query.Group;

    doRender(req, res);
});


app.get("/deleterecording", function (req, res) {
    app.mythtv.RemoveRecording(req.query.ChanId, req.query.StartTs, function (reply) {
        log.info("Reply from /Dvr/RemoveRecorded?ChanId=" + req.query.ChanId + "&StartTime=" + req.query.StartTs);
        log.info(reply);
        if (!reply.bool) {
            app.mythtv.blast({
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
    var program = app.mythtv.byFilename[req.query.FileName];

    var flags = [ ];
    if (program.hasOwnProperty("ProgramFlags_")) {
        Object.keys(program.ProgramFlags_).forEach(function (flag) {
            if (program.ProgramFlags_[flag])
                flags.push(flag);
        });
    }

    res.render("info/recording", {
        mythtv      : app.mythtv,
        MythBackend : app.mythtv.MythServiceHost(req),
        recording   : program,
        flags       : flags.join(' ')
    });
});


app.get("/recordingedit", function (req, res) {
    var program = app.mythtv.byFilename[req.query.FileName];

    res.render("info/recordingedit", {
        mythtv      : app.mythtv,
        MythBackend : app.mythtv.MythServiceHost(req),
        recording   : program,
    });
});


app.post("/recordingedit", function (req, res) {
    log.info("/recordingedit:");
    log.info(req.body);

    var updates = { };
    if (!!req.body.Title)
        updates.Title = req.body.Title;
    if (!!req.body.SubTitle)
        updates.SubTitle = req.body.SubTitle;
    if (!!req.body.Description)
        updates.Description = req.body.Description;

    var current = app.mythtv.GetRecordingRecord(req.body.ChanId, req.body.StartTs);
    var updated = { };
    mxutils.copyProperties(current, updated);
    mxutils.copyProperties(updates, updated);

    log.info(updated);
    app.mythtv.FillProgramInfo(updated);

    res.writeHead(200);
    res.end();
});
