
module.exports = function (req, res, next) {

    res.local("Title", "MythExpress");

    if (req.headers.hasOwnProperty("user-agent")) {
        var browser = req.headers["user-agent"];
        var isIOS = browser.search(/iPad|iPod|iPhone/) != -1;
        var isWebApp = isIOS && browser.search(/Mobile/) != -1 && browser.search(/Safari/) == -1;
        res.local("isIOS", isIOS);
        res.local("isWebApp", isWebApp);
    } else {
        res.local("isIOS", false);
        res.local("isWebApp", false);
    }

    // so browser can orient on page load, view transitions, etc.
    // some individual routes will change these defaults
    res.local("Context", {
        View : req.query.View || "Programs",
        Group : req.query.Group || "Default"
    });

    if (req.isXMLHttpRequest) {
        res.local("layout", false);
    }
    //console.log(req.url);
    //console.log(req.headers);

    next();
}