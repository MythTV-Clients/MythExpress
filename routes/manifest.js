
var manifest = false;
var isProduction = app.settings.env === "production";

var filesToIgnore = ["^[.]", "[#~]$", "^webapp.css$", "^browser.css$"].join("|");

var whitelist2 = ["frontend/list","frontend/play","recordings","properties","recordinginfo",
                 "streams","streamstatus","streamplayer","seconds","streaminfo","deletestream",
                 "ui/buttons","ui/views","videos","videoinfo","watch"];

var whitelist = ["NETWORK:","*","#"];

var whitelist3 = ["NETWORK:","*",
                 "frontend/list","frontend/play","recordings","properties","recordinginfo",
                 "streams","streamstatus","streamplayer","seconds","streaminfo","deletestream",
                 "ui/buttons","ui/views","videos","videoinfo","watch"];

function deepScan(directory) {
    // log.info("Scan " + directory);
    var lastModification = 0;
    var list = [ ];
    fs.readdirSync(directory).forEach(function(file) {
        if (!file.match(filesToIgnore)) {
            var fullPath = directory + '/' + file;
            // log.info(file);
            var stats = fs.statSync(fullPath);
            // log.info(stats);
            if (stats.isFile()) {
                //log.info("stat " + fullPath);
                //log.info("    file.match(/(^.)|([#~]$)/) " + !!file.match(/^[.]|[#~]$/));
                var modTime = stats.mtime.getTime();
                if (modTime > lastModification) {
                    lastModification = modTime;
                }
                // no css or js for production - they're combined & minified in app.js
                if (!isProduction || !file.match(/[.](css|js)$/)) {
                    list.push(fullPath);
                }
            } else if (stats.isDirectory()) {
                var scan = deepScan(fullPath);
                if (scan.list.length > 0)
                    list = list.concat(scan.list);
                if (scan.lastModification > lastModification)
                    lastModification = scan.lastModification;
            }
        }
    });
    return { lastModification : lastModification, list : list };
}


function buildManifest(req) {
    var scan = deepScan(__dirname + "/public");
    var homeLen = (__dirname + "/public/").length;
    var relativePaths = scan.list.map(function (fullPath) { return fullPath.substr(homeLen); });

    var manifestLines = ["CACHE MANIFEST"].concat(relativePaths);
    manifestLines.push("# " + scan.lastModification);

    if (isProduction) {
        manifestLines.push("js/all.js");
    }

    var paths = { };
    //app.routes.all().forEach(function (route) {
    //    if (route.hasOwnProperty("path")) {
    //        paths[route.path.split("/")[1]] = true;
    //    }
    //});
    var whitelist = [ "NETWORK:", "*", "http://*", "#" ];
    // Object.keys(paths).forEach(function (path) {
    //     if (path.length > 0)
    //         whitelist.push(path + "*");
    // });

    var cssPath = isProduction ? "css/dark-hive/" : "css/";

    manifest = {
        WebApp : manifestLines.concat([cssPath + "webapp.css"].concat(whitelist)).join("\n"),
        Browser : manifestLines.concat([cssPath + "browser.css"].concat(whitelist)).join("\n")
    };

    log.info("manifest built with last time @ " + scan.lastModification);
}


app.get("/mythexpress.appcache", MX, function (req, res) {
    if (!manifest)
        buildManifest(req);

    res.header("Content-Type", "text/cache-manifest");
    res.header("Cache-Control", "no-cache");
    res.send(res.locals.isWebApp ? manifest.WebApp : manifest.Browser);
    log.info("sent manifest to " + req.headers["user-agent"]);
});


function watchEvent (event, filename) {
    log.info("watchEvent: " + event + " " + filename);
    // on OS/X filename isn't coming through so just reload on any change
    manifest = false;
}

function scanAndWatch(directory) {
    fs.readdirSync(directory).forEach(function(file) {
        var fullPath = directory + '/' + file;
        var stats = fs.statSync(fullPath);
        if (file.match(/[.](js|css)$/)) {
            fs.watch(fullPath, function (event, filename) {
                log.info("WatchEvent " + event + " on " + file);
                manifest = false;
            });
        } else {
            if (stats.isDirectory())
                scanAndWatch(fullPath);
        }
    });
}

if (!isProduction && (os.platform() === "darwin" || os.platform() === "linux")) {
    scanAndWatch(__dirname + "/public");
}
