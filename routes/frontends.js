

app.get("/frontend/list", function (req, res) {

    res.json(frontends.FrontendList());

});


app.get("/frontend/play", function (req, res) {

    frontends.SendToFrontend(req.query, mythtv);

    res.writeHead(200);
    res.end();

});
