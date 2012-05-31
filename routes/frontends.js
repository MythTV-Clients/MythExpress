
app.get("/frontend/list", function (req, res) {

    res.json(mythtv.GetFrontendList());

});


app.get("/frontend/play", function (req, res) {

    mythtv.SendToFrontend(req.query);

    res.writeHead(200);
    res.end();

});