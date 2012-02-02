
/*
 * GET home page.
 */

//var soap = require("soap");

app.get("/", function (req, res) {
//    var args = { name: 'value'};
//    soap.createClient("http://core2:6544/Dvr/GetRecordedList?StartIndex=2&Count=3&Descending=true", function(err, client) {
//        client.MyFunction(args, function(err, result) {
//            console.log(result);
            res.render('index', { title: 'Express' })
//        });
//    });
});