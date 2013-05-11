
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
        //log.info("all request cookies:");
        //log.info(req.cookies);
        if (!req.cookies.mythexpress) {
            res.cookie("mythexpress", cookieTicker++, { expires: null, path : "/" });
        }
    }
    //log.info(req.url);
    //log.info(req.headers);

    next();
}
