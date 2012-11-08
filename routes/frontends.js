

app.get("/frontend/list", function (req, res) {
    res.json(frontends.FrontendList());
});


app.get("/frontend/play", function (req, res) {
    frontends.SendToFrontend(mxutils.copyProperties(req.query, { SenderCookie : req.cookies.mythexpress }), app.mythtv);

    res.writeHead(200);
    res.end();
});

frontends.on("senderror", function (details) {
    app.mythtv.blast({ Alert : true, Category : "Frontend", Class : "Alert", Decay  : 5,
                       Message : details.Host + " " + (details.hasOwnProperty("Error") ? details.Error : "refused network control") },
                     details.SenderCookie);
});
