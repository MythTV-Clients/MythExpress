
/**
 * Module dependencies.
 */

var vm = require('vm');
var fs = require('fs');

module.exports = function (context) {
    var dir = __dirname + '/routes';
    // grab a list of our route files
    fs.readdirSync(dir).forEach(function(file) {
        if (file.substr(-3) === ".js" && file >= "0") {
            context.log.info('    Boot ' + file);
            var str = fs.readFileSync(dir + '/' + file, 'utf8');
            // inject some pseudo globals by evaluating the file
            // with vm.runInNewContext() instead of loading it with
            // require(). require's internals use similar, so dont
            // be afraid of "boot time".
            var ctx = { }
            for (var key in context) ctx[key] = context[key];
            // we have to merge the globals for console, process etc
            for (var key in global) ctx[key] = global[key];
            // note that this is essentially no different than ... just using
            // global variables, though it's only YOUR code that could influence
            // them, which is a bonus.
            vm.runInNewContext(str, ctx, file);
        }
    });
};
