
var fs = require("fs");
var jade = require("jade");
var _ = require("underscore");


// these two functions take a simple xml string like:
// <?xml version="1.0" encoding="utf-8"?><detail><errorCode>401</errorCode><errorDescription>Invalid Action</errorDescription></detail>
// and break it into an array like:
// ["<?xml version="1.0" encoding="utf-8"?", "detail", "errorCode>401</errorCode", "errorDescription>Invalid Action</errorDescription", "/detail>"]
// and then convert the elements into a js structure that matches the xml

function objFromAttrs(attrList) {
    var obj = { };
    while (attrList.length > 0) {
        if (attrList[0].substr(0,1) === "/") {
            return obj;
        } else if (attrList[0].match("</")) {
            var parts = attrList[0].split(/[<>]/);
            obj[parts[0]] = parts[1];
            attrList.shift();
        } else {
            var attrName = attrList.shift();
            obj[attrName] = objFromAttrs(attrList);
        }
    }
}

exports.xmlStringToObject = function (xmlString) {
    attrList = xmlString.split(/></);
    attrList.shift();  // remove the ?xml part
    return objFromAttrs(attrList);
}

exports.filterIPv4 = function (addressList) {
    var ip4 = [ ];
    addressList.forEach(function (address) {
        if (address.match(/^[.0-9]+$/))
            ip4.push(address);
    });
    return ip4;
};

exports.hostFromService = function (service) {
    var parts = service.name.split(/[ ]/);
    return parts[parts.length - 1];
};

// similar to jQuery extend
exports.copyProperties = function (src, dst) {
    Object.keys(src).forEach(function (property) {
        if (src.hasOwnProperty(property)) { // don't copy properties from parent objects
            if (typeof(src[property]) === "object" && !src[property].hasOwnProperty("length")) {
                // property is an object but not an array
                if (!dst.hasOwnProperty(property))
                    dst[property] = { };
                exports.copyProperties(src[property], dst[property]);
            } else {
                dst[property] = src[property];
            }
        }
    });
    return dst;
};


// prepare jade files in the views directory for client-side use


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

exports.clientSideTemplates = function() {

    var dir = __dirname + "/views";

    var fullPaths = scanFolder(dir, { });

    var body = "document.templates = {" +
        _.map(fullPaths, function (val, key) {
            var newKey = key.substr(dir.length+1).replace(".jade","");
            return '"' + newKey + '" : ' + fullPaths[key];
        }).join(",") +
        "};";

    return body;
}

exports.jadeRuntime = function() {

    return fs.readFileSync(__dirname + "/node_modules/jade/runtime.js", "utf8")

}
