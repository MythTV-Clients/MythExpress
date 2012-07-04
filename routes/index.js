
/*
 * GET home page.
 */

app.get("/", MX, function (req, res) {
    app.sendHeaders(req, res);
    res.render('index', {
        Title: 'MythExpress',
        RecGroups : mythtv.viewButtons.Programs,
    });
});