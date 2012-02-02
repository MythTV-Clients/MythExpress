$(document).ready(function() {

    function checkIfReady() {
        var streamId = $("#Content").find('.mn-Data').dataAttrs(["WaitId"]).WaitId;
        if (!!streamId && streamId.length > 0) {
            $.get("/streamplayer", { StreamId : streamId }, function (html, textStatus, jqXHR) {
                if (html.length > 0) {
                    //console.log("got player");
                    $("#Content").html(html);
                } else {
                    //console.log("haven't got player");
                    window.setTimeout(checkIfReady,1000);
                }
            });
        }
    }

    checkIfReady();
});