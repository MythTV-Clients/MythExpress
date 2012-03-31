
/*
 * GET home page.
 */

app.get("/", function (req, res) {
    res.render('index', {
        Title: 'MythExpress',
        RecGroups : mythtv.recGroups,
    });
});