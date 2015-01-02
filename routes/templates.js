
// var vm = require('vm');
// var fs = require("fs");

var compileOptions = {
    client: true,
    compileDebug: false,
    pretty: false
};

function scanFolder(folder, paths) {
    
    fs.readdirSync(folder).forEach(function(file) {
        var fullName = folder + "/" + file;
        if (file.substr(-5) === ".jade" && file >= "0") {
            var src = fs.readFileSync(fullName, { encoding: "utf8" });
            compileOptions.filename = fullName;
            paths[fullName] = jade.compileClient(src, compileOptions);
        } else {
            var stats = fs.statSync(fullName);
            if (stats.isDirectory()) {
                scanFolder(fullName, paths);
            }
        }
    });

    return paths;

}

app.get("/js/templates.js", function (req, res) {

    res.set("Content-Type", "text/javascript");
    res.status(200);

    var dir = __dirname + "/views";

    var fullPaths = scanFolder(dir, { });

    var body = "document.templates = {" +
        _.map(fullPaths, function (val, key) {
            var newKey = key.substr(dir.length+1).replace(".jade","");
            return '"' + newKey + '" : ' + fullPaths[key];
        }).join(",") +
        "};";

    res.send(body);

    res.end();

});

app.get("/js/runtime.js", function (req, res) {

    res.set("Content-Type", "text/javascript");
    res.status(200);

    var readStream = fs.createReadStream(__dirname + "/node_modules/jade/runtime.js");
    readStream.pipe(res);

});
