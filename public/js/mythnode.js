$(document).ready(function() {

    var streamUpdater = new $.timer(updateStreamStatus, 5000, true);

    var infoDialog = $("#InfoDialog").dialog({
        autoOpen : false,
        modal : true,
        dialogClass : "mn-InfoDialog",
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
        var dataElement = $(this[0]).closest(".mn-Data");
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
            var elem = dataElement.find(".mn-" + parameter);
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

            //$("#Header button").removeClass("mn-Selected");
            //if ($('#Header *[data-href="' + window.location.pathname + '"]').addClass("mn-Selected").length == 0) {
            //    if (State.data.RecGroup) {
            //        $("#Header .mn-RecGroup:contains('"+State.data.RecGroup+"')").addClass("mn-Selected");
            //    }
            //}

            if (!event) {
                // ignore state changes from internal history manipulation
                console.log('empty event');
                console.log(State);
                return false;
            }
            console.log(event);
            if (State.data.historyInit) {
                console.log('squelched');
                var newData = State.data;
                delete newData.historyInit;
                History.replaceState(newData, State.title, State.url);
                return false;
            }
            console.log('State Change');
            console.log(State.url);
            console.log(State.data);
            $.get(State.url, State.data,
                  function(data, textStatus, jqXHR) {
                      console.log('got ' + State.url);
                      if (data !== $("#Content").html()) {
                          console.log('replaced');
                          $("#Content").html(data);
                      }

                      if ($("#Content .mn-Stream").length > 0 || (State.url.match(/streams$/) && $("#Content").html.length == 0)) {
                          streamUpdater.play();
                      }
                  },
                  "HTML");

            event.preventDefault();
            return false;
        });
    }

    // ////////////////////////////////////////////////////////////////////////
    // View management
    // ////////////////////////////////////////////////////////////////////////

    function updateStreamStatus() {
        var streamDiv = $("#Content .mn-Stream");

        if (streamDiv.length == 0) {
            streamUpdater.pause();
            return;
        }

        var oldDivs = { };

        $("#Content .mn-Stream").each(function () {
            oldDivs[$(this).attr("id")] = true;
        });

        $.get("/streamstatus", function (newDivs, textStatus, jqXHR) {
            newDivs.forEach(function (html) {
                var newDiv = $(html), divId = newDiv.attr("id");
                var oldDiv = $("#" + divId);
                if (oldDiv.length == 1) {
                    if (oldDiv.html() !== newDiv.html()) {
                        //console.log('replace ' + divId);
                        oldDiv.replaceWith(newDiv);
                    }
                } else {
                    //console.log('add ' + divId);
                    $("#Content").prepend(newDiv).fadeIn("slow");
                }
                delete oldDivs[divId];
            });

            Object.keys(oldDivs).forEach(function (divId) {
                //console.log('remove ' + divId);
                //$("#" + divId).slideUp("slow", function () { $(this).remove(); });
                $("#" + divId).remove();
            });
        });
    }


    var recordingButtons = [
        {
            text : "Watch",
            click : function () {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mn-Data");
                History.pushState(target.dataAttrs(["FileName"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }
        }
    ];

    var streamButtons = [
        {
            text : "Watch",
            click : function (ev) {
                $(this).dialog("close");
                var target = $("#InfoDialog").find(".mn-Data");
                console.log(target);
                History.pushState(target.dataAttrs(["FullURL","Width","Height"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }
        },
        {
            text : "Delete",
            click : function () {
                $(this).dialog("close");
                var parms = $("#InfoDialog").find(".mn-Data").dataAttrs(["StreamId"]);
                $.get("/deletestream", parms);
                $("#S" + parms.StreamId).slideUp("slow", function () { $(this).remove(); });
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
            console.log("Menu click");
            if (target.length > 0) {
                console.log(target);
                $("#Content").html("");
                if (target.hasClass("mn-RecGroup")) {
                    currentRecGroup = target.text().sanitized();
                    History.pushState(
                        { RecGroup: currentRecGroup },
                        target.text().sanitized() + " Recording Group",
                        "/recordings");
                } else {
                    console.log('load ' + target.attr('data-href'));
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
        var target = $(ev.target).closest(".mn-Clickable");
        if (target.length > 0) {

            if (target.hasClass("mn-Folder")) {
                var showTitle = target.dataText(["Title"]).Title;
                History.pushState(
                    { RecGroup: currentRecGroup, Title : showTitle },
                    currentRecGroup + " • " + showTitle,
                    "/recordings");
            }

            else if (target.hasClass("mn-RecordingPreview")) {
                History.pushState(target.dataAttrs(["FileName"]),
                                  target.dataAttrs(["Title"]).Title,
                                  "/streams");
            }

            else if (target.hasClass("mn-StreamPreview")) {
                History.pushState(target.dataAttrs(["FullURL","Width","Height"]),
                                  target.dataText(["Title"]).Title,
                                  "/streams");
            }

            else if (target.hasClass("mn-VideoFolder")) {
                History.pushState(target.dataAttrs(["VideoFolder"]),
                                  document.title + " / " + target.dataText(["Title"]).Title,
                                  "/videos");
            }

            else if (target.hasClass("mn-Recording")) {
                $("#InfoDialogContent").html("");
                infoDialog
                    .dialog("option", "buttons", recordingButtons)
                    .dialog("open");
                $.get("/recordinginfo", target.dataAttrs(["FileName"]),
                      function (info, textStatus, jqXHR) {
                          $("#InfoDialogContent").html(info);
                      });
            }

            else if (target.hasClass("mn-Stream")) {
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
    console.log('push state');
    console.log({ historyInit : true, RecGroup : currentRecGroup, VideoFolder : currentVideoFolder,
                  Title : "Default Recording Group", PathName : window.location.pathname })
    History.pushState({ historyInit : true, RecGroup : currentRecGroup, VideoFolder : currentVideoFolder },
                      document.title, window.location.pathname);

});