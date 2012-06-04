
app.get("/buttons", function(req, res) {
    res.partial("button", mythtv.recGroups());
});