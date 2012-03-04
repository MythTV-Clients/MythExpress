$(document).ready(function() {

    $("#Content").everyTime("5s", function () {
        var oldDivs = { };
        $.get("/streamstatus", function(newDivs, textStatus, jqXHR) {
            newDivs.forEach(function (newDiv) {
                console.log(newDiv);
            });
        });

        $("#Content .mx-Stream").forEach(function (div) {
            oldDivs[div.attr("id")] = true;
        });
    });

});