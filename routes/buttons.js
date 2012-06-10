
app.get("/buttons", function(req, res) {
    res.partial("button", mythtv.viewButtons.Programs);
});