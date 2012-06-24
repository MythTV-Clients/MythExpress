module.exports = function (req, res, next) {

    if (req.isXMLHttpRequest) {
        res.local("layout", false);
    }

    if (req.headers.hasOwnProperty("user-agent")) {
        var browser = req.headers["user-agent"];
        var isIOS = browser.search(/iPad|iPod|iPhone/) != -1;
        var isWebApp = isIOS && browser.search(/Mobile/) != -1 && browser.search(/Safari/) == -1;
        res.local("isIOS", isIOS);
        res.local("isWebApp", isWebApp);
        // if (req.isXMLHttpRequest) {
        //     console.log(browser);
        //     console.log("isIOS: " + isIOS + " isWebApp: " + isWebApp);
        // }
    } else {
        res.local("isIPad", false);
        res.local("isWebApp", false);
    }

    // so browser can orient on page load, view transitions, etc.
    // some individual routes will change these defaults
    req.Context = {
        View : req.query.View || "Programs",
        Group : req.query.Group || "Default"
    };
    res.local("Context", req.Context);

    res.local("Title", "MythExpress");

    next();
}