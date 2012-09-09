
var cookieTicker = +new Date();

module.exports = function (req, res, next) {

    res.locals.Title = "MythExpress";
    res.locals.appEnv = appEnv;

    if (req.headers.hasOwnProperty("user-agent")) {
        var browser = req.headers["user-agent"];
        var isIOS = browser.search(/iPad|iPod|iPhone/) != -1;
        var isWebApp = isIOS && browser.search(/Mobile/) != -1 && browser.search(/Safari/) == -1;
        res.locals.isIOS = isIOS;
        res.locals.isWebApp = isWebApp;
    } else {
        res.locals.isIOS = false;
        res.locals.isWebApp = false;
    }

    // so browser can orient on page load, view transitions, etc.
    // some individual routes will change these defaults
    res.locals.Context = {
        View : req.query.View || "Programs",
        Group : req.query.Group || "Default"
    };

    if (!req.xhr) {
        //console.log("all request cookies:");
        //console.log(req.cookies);
        if (!req.cookies.mythexpress) {
            res.cookie("mythexpress", cookieTicker++, { expires: null, path : "/" });
        }
    }
    //console.log(req.url);
    //console.log(req.headers);

    next();
}
