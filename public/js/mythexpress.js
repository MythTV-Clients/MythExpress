$(document).ready(function() {

    if (typeof console === 'undefined') {
        console = { };
        if (typeof console.log === 'undefined')
            console.log = function () { }
    }

    var infoDialog = $("#InfoDialog").dialog({
        autoOpen : false,
        modal : true,
        dialogClass : "mx-InfoDialog",
        width : 800, height : 600
    });

    // ////////////////////////////////////////////////////////////////////////
    // Helpers
    // ////////////////////////////////////////////////////////////////////////

    String.prototype.sanitized = function () {
        return this.replace(/[\n\r]/g, "").replace(/[ ]+$/, "");
    }

    var currentRecGroup = "Default";
    var currentVideoFolder = "/";

    jQuery.fn.dataAttrs = function () {
        var dataElement = $(this[0]).closest(".mx-Data");
        var parameters = arguments[0] || [ ];
        var result = { };
        parameters.forEach(function (parameter) {
            var value = dataElement.attr("data-" + parameter);
            if (!!value && value.length > 0)
                result[parameter] = value;
        });
        return result;
    };

    jQuery.fn.dataText = function() { // not always hidden but...
        var dataElement = $(this[0]);
        var parameters = arguments[0] || [ ];
        var result = { };
        parameters.forEach(function (parameter) {
            var elem = dataElement.find(".mx-" + parameter);
            var text = elem.contents(":not(:empty)").first().text().sanitized();
            if (text.length == 0)
                text = elem.text().sanitized();
            if (elem.length > 0)
                result[parameter] = text;
        });
        return result;
    }

    // ////////////////////////////////////////////////////////////////////////
    // History management
    // ////////////////////////////////////////////////////////////////////////

    var History = window.History; // Note capital H for the History.js object
    if (History.enabled) {
        $(window).bind('statechange', function () {
            var State = History.getState();

            if (!event) {
                // kludge to ignore state changes from internal
                // history manipulation but still act like we've
                // loaded the view the usual way
                if ($("#Content .mx-StreamList").length > 0) {
                    setTimeout(updateStreamStatus, 5000);
                }
                return false;
            }

            if (State.data.historyInit) {
                var newData = State.data;
                delete newData.historyInit;
                History.replaceState(newData, State.title, State.url);
                return false;
            }

            $.get(State.url, State.data,
                  function(data, textStatus, jqXHR) {
                      if (data !== $("#Content").html()) {
                          $("#Content").html(data);
                      }

                      if ($("#Content .mx-StreamList").length > 0) {
                          setTimeout(updateStreamStatus, 5000);
                      }
                  });

            event.preventDefault();
            return false;
        });
    }

    // ////////////////////////////////////////////////////////////////////////
    // View management
    // ////////////////////////////////////////////////////////////////////////

    function updateStreamStatus() {
        if ($("#Content .mx-StreamList").length == 0) {
            // there's an empty streamlist div acting as a sentinal.
            // its absence indicates we've moved way from the stream list
            return;
        }

        var oldDivs = { };

        $("#Content .mx-Stream").each(function () {
            oldDivs[$(this).attr("data-streamid")] = true;
        });

        $.get("/streamstatus", function (newDivs, textStatus, jqXHR) {
            if ($("#Content .mx-StreamList").length > 0) {
                newDivs.forEach(function (html) {
                    var newDiv = $(html), divId = newDiv.attr("data-streamid");
                    var oldDiv = $("#Content div[data-streamid = " + divId + "]");
                    if (oldDiv.length == 1) {
                        if (oldDiv.html() !== newDiv.html()) {
                            oldDiv.replaceWith(newDiv);
                        }
                    } else {
                        newDiv.hide().prependTo('#Content').slideDown(1000);
                    }
                    delete oldDivs[divId];
                });

                Object.keys(oldDivs).forEach(function (divId) {
                    $("#Content div[data-streamid = " + divId + "]").slideUp("slow", function () { $(this).remove(); });
                });

                setTimeout(updateStreamStatus, 5000);
            }
        });
    }


    var recordingButtons = [
        {
            text : "Stream",
            click : function () {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mx-Data");
                History.pushState(target.dataAttrs(["FileName"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }
        },
        {
            text : "Direct Play",
            click : function () {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mx-Data");
                window.open("/watch/file/" + target.dataAttrs(["FileName"]).FileName,
                            target.dataText(["Title"]).Title,
                            "_blank");
            }
        },
        {
            text : "Close",
            click : function () {
                $(this).dialog("close");
            }
        }
    ];

    var videoButtons = [
        {
            text : "Stream",
            click : function () {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mx-Data");
                History.pushState(target.dataAttrs(["VideoId"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }
        },
        {
            text : "Direct Play",
            click : function () {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mx-Data");
                window.open("/watch/video/" + target.dataAttrs(["VideoId"]).VideoId,
                            "",
                            "_blank");
            }
        },
        {
            text : "Close",
            click : function () {
                $(this).dialog("close");
            }
        }
    ];

    var streamButtons = [
        {
            text : "Stream",
            click : function (ev) {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mx-Data");
                History.pushState(target.dataAttrs(["StreamId"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }
        },
        {
            text : "Delete",
            click : function () {
                $(this).dialog("close");
                var parms = $("#InfoDialog").find(".mx-Data").dataAttrs(["StreamId"]);
                $.get("/deletestream", parms);
                $("#S" + parms.StreamId).slideUp("slow", function () { $(this).remove(); });
            }
        },
        {
            text : "Close",
            click : function () {
                $(this).dialog("close");
            }
        }
    ];


    // ////////////////////////////////////////////////////////////////////////
    // Ajax
    // ////////////////////////////////////////////////////////////////////////

    $("#Header button")
        .button()
        .click(function (ev) {
            var target = $(ev.target.offsetParent);
            if (target.length > 0) {
                $("#Content").html("");
                if (target.hasClass("mx-RecGroup")) {
                    currentRecGroup = target.text().sanitized();
                    History.pushState(
                        { RecGroup: currentRecGroup },
                        target.text().sanitized() + " Recording Group",
                        "/recordings");
                } else {
                    History.pushState(
                        { partial : true }, // to differentiate from page refreshes which bring up header too
                        target.text().sanitized(),
                        target.attr('data-href'));
                }
                return false;
            }
            return true;
        });

    $("#Content").click(function (ev) {
        var target = $(ev.target).closest(".mx-Clickable");
        if (target.length > 0) {

            if (target.hasClass("mx-Folder")) {
                var showTitle = target.dataText(["Title"]).Title;
                History.pushState(
                    { RecGroup: currentRecGroup, Title : showTitle },
                    currentRecGroup + " • " + showTitle,
                    "/recordings");
            }

            else if (target.hasClass("mx-RecordingPreview")) {
                History.pushState(target.dataAttrs(["FileName"]),
                                  target.dataAttrs(["Title"]).Title,
                                  "/streams");
            }

            else if (target.hasClass("mx-Recording")) {
                $("#InfoDialogContent").html("");
                infoDialog
                    .dialog("option", "buttons", recordingButtons)
                    .dialog("open");
                $.get("/recordinginfo", target.dataAttrs(["FileName"]),
                      function (info, textStatus, jqXHR) {
                          $("#InfoDialogContent").html(info);
                      });
            }

            else if (target.hasClass("mx-VideoFolder")) {
                History.pushState(target.dataAttrs(["VideoFolder"]),
                                  document.title + " / " + target.dataText(["Title"]).Title,
                                  "/videos");
            }

            else if (target.hasClass("mx-VideoCover")) {
                History.pushState(target.dataAttrs(["VideoId"]),
                                  target.parent().dataText(["Title"]).Title,
                                  "/streams");
            }

            else if (target.hasClass("mx-Video")) {
                $("#InfoDialogContent").html("");
                infoDialog
                    .dialog("option", "buttons", videoButtons)
                    .dialog("open");
                $.get("/videoinfo", target.dataAttrs(["VideoId"]),
                      function (info, textStatus, jqXHR) {
                          $("#InfoDialogContent").html(info);
                      });
            }

            else if (target.hasClass("mx-StreamPreview")) {
                History.pushState(target.dataAttrs(["StreamId"]),
                                  target.parent().dataText(["Title"]).Title,
                                  "/streams");
            }

            else if (target.hasClass("mx-Stream")) {
                $("#InfoDialogContent").html("");
                infoDialog
                    .dialog("option", "buttons", streamButtons)
                    .dialog("open");
                $.get("/streaminfo", target.dataAttrs(["StreamId"]),
                      function (info, textStatus, jqXHR) {
                          $("#InfoDialogContent").html(info);
                      });
            }

            return false;
        }
        return true;
    });


    // ////////////////////////////////////////////////////////////////////////
    // Initialization
    // ////////////////////////////////////////////////////////////////////////

    // save initial state so back button has somewhere to go
    History.pushState({ historyInit : true, RecGroup : currentRecGroup, VideoFolder : currentVideoFolder },
                      document.title, window.location.pathname);

});