
app.get("/about", MX, function (req, res) {

    console.log(req.query);

    var group = req.query.hasOwnProperty("Group") ? req.query.Group : "overview";

    var button = mythtv.viewButtons.About.reduce(function(previousValue, currentValue) {
        return currentValue.recGroup === group ? currentValue : previousValue;
    });

    res.local("Context", {
        View : "About",
        Group : group
    });

    app.sendHeaders(req, res);
    res.render("about/" + group);

});
