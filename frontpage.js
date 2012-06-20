module.exports = function (req, res, next) {

    if (req.isXMLHttpRequest)
        res.local("layout", false);

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