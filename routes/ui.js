
app.get("/ui/buttons", function(req, res) {
    if (!req.query.hasOwnProperty("View"))
        req.query.View = "Programs";
    console.log("buttons for " + req.query.View);
    console.log(req.query)
    res.render("ui/buttons", {
        buttons : app.mythtv.viewButtons[req.query.View] || [ ]
    });
});

var views = {
    Programs   : "recordings",
    Properties : "properties",
    About      : "about"
};

app.get("/ui/views", function (req, res) {
    res.render("ui/views",
                {
                    views : Object.keys(views),
                },
                function (err, html) {
                    res.json({
                        Markup : html,
                        Map : views
                    });
                });
});
