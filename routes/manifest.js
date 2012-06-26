
var manifest;
var isProduction = app.settings.env === "production";
var filesToIgnore = ["^[.]", "[#~]$", "^webapp.css$", "^browser.css$"].join("|");


function deepScan(directory) {
    // console.log("Scan " + directory);
    var lastModification = 0;
    var list = [ ];
    fs.readdirSync(directory).forEach(function(file) {
        if (!file.match(filesToIgnore)) {
            var fullPath = directory + '/' + file;
            // console.log(file);
            var stats = fs.statSync(fullPath);
            // console.log(stats);
            if (stats.isFile()) {
                //console.log("stat " + fullPath);
                //console.log("    file.match(/(^.)|([#~]$)/) " + !!file.match(/^[.]|[#~]$/));
                var modTime = stats.mtime.getTime();
                if (modTime > lastModification) {
                    lastModification = modTime;
                }
                if (!isProduction || !file.match(/[.](css|js)$/)) {
                    // console.log("   added");
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


function buildManifest() {
    var scan = deepScan(__dirname + "/public");

    var homeLen = (__dirname + "/public/").length;

    var relativePaths = scan.list.map(function (fullPath) { return fullPath.substr(homeLen); });

    var manifestLines = ["CACHE MANIFEST","NETWORK:","*","CACHE:"].concat(relativePaths);
    manifestLines.push("# " + scan.lastModification);

    if (isProduction) {
        manifestLines.push("js/mythstreams.js", "js/wait.js", "js/all.js");
    }

    var cssPath = isProduction ? "css/dark-hive/" : "css/";

    manifest = {
        WebApp : manifestLines.concat([cssPath + "webapp.css"]).join("\n"),
        Browser : manifestLines.concat([cssPath + "browser.css"]).join("\n")
    };
}


app.get("/" + app.settings.env + ".manifest", function (req, res) {
    if (!manifest)
        buildManifest();

    res.header("Content-Type", "text/cache-manifest");
    res.send(res._locals.isWebApp ? manifest.WebApp : manifest.Browser);
});


function watchEvent (event, filename) {
    console.log("watchEvent: " + event + " " + filename);
    // on OS/X filename isn't coming through so just reload on any change
    buildManifest();
}

function scanAndWatch(directory) {
    fs.readdirSync(directory).forEach(function(file) {
        if (file.match(/[.](js|css)$/)) {
            var fullPath = directory + '/' + file;
            fs.watch(fullPath, watchEvent);
            var stats = fs.statSync(fullPath);
            if (stats.isDirectory())
                scanAndWatch(fullPath);
        }
    });
}

if (!isProduction && (os.platform() === "darwin" || os.platform() === "linux")) {
    scanAndWatch(__dirname + "/public");
}