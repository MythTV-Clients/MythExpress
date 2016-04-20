
// var vm = require('vm');
// var fs = require("fs");

app.get("/js/templates.js", function (req, res) {

    res.set("Content-Type", "text/javascript");
    res.status(200);

    res.send(mxutils.clientSideTemplates());

    res.end();

});

app.get("/js/runtime.js", function (req, res) {

    res.set("Content-Type", "text/javascript");
    res.status(200);

    var readStream = fs.createReadStream(__dirname + "/node_modules/jade/runtime.js");
    readStream.pipe(res);

});
