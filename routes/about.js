
app.get("/about", MX, function (req, res) {

    console.log(req.query);

    var group = req.query.hasOwnProperty("Group") ? req.query.Group : "overview";

    var button = app.mythtv.viewButtons.About.reduce(function(previousValue, currentValue) {
        return currentValue.recGroup === group ? currentValue : previousValue;
    });

    res.locals.Context = {
        View  : "About",
        Group : group,
        Title : "MythExpress " + button.Title
    };

    app.sendHeaders(req, res);
    res.render(req.xhr ? "about/" + group : "layout");

});
