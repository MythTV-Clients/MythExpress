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
        width : 800, height : 600,
        open : function (event, ui) {
            $("#InfoDialog").parent().find(".ui-dialog-buttonpane button:last").focus();
        }
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

    function getVideoParameters() {
        var res = { };
        res.vid = $("#Content .nm-VideoBox");
        if (res.vid.length == 1) {
            res.W = Number(res.vid.attr("width"));
            res.H = Number(res.vid.attr("height"));
            res.baseW = Number(res.vid.attr("data-W"));
            res.baseH = Number(res.vid.attr("data-H"));
        }
        return res;
    }

    // ////////////////////////////////////////////////////////////////////////
    // History management
    // ////////////////////////////////////////////////////////////////////////

    function loadCurrentView(State) {
        $.get(State.url, State.data,
              function(data, textStatus, jqXHR) {
                  if (data !== $("#Content").html()) {
                      $("#Content").html(data);
                  }

                  if ($("#Content .mx-StreamList").length > 0) {
                      setTimeout(updateStreamStatus, 5000);
                  }

                  var videoControls = $("#Content .mx-ControlBubble button");
                  if (videoControls.length > 0) {
                      videoControls.button();
                  }
              });
    }

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

            loadCurrentView(State);

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

    // manage list of frontends we can throw to

    var feList = [ ];
    var processingFEChange = false;

    function throwTo(host) {
        var target;
        if (target = $("#InfoDialogContent p[data-FileName]").attr("data-FileName")) {
            $.get("/frontend/play", { Host : host, FileName : target });
        } else if (target = $("#InfoDialogContent p[data-VideoId]").attr("data-VideoId")) {
            $.get("/frontend/play", { Host : host, VideoId : target });
        }
        $("#InfoDialog").dialog("close");
    }

    function processFrontendChange(event) {
        if (feList.length > 0) {
            recordingButtons = recordingButtons.slice(feList.length);
            videoButtons = videoButtons.slice(feList.length);
        }
        var newFEs = event.Frontends;
        if (newFEs.length > 0) {
            // reverse sort FEs because we prepend to the button list
            newFEs.sort(function (f1,f2) { return f1.toLowerCase() > f2.toLowerCase() ? -1 : 1; });
            newFEs.forEach(function (fe) {
                recordingButtons.unshift({
                    text : fe,
                    click : function () { throwTo(fe); }
                });
                videoButtons.unshift({
                    text : fe,
                    click : function () { throwTo(fe); }
                });
            });
        }
        feList = newFEs;
    }

    $.get("/frontend/list", function (newFEs) {
        processFrontendChange({ Frontends : newFEs });
    });


    // ////////////////////////////////////////////////////////////////////////
    // Ajax
    // ////////////////////////////////////////////////////////////////////////

    $("#Header").on("click", "button", function (event) {
        console.log("button click");
        $("#Content").html("");

        var args = { partial : true };
        var target = $(this);
        var href = target.attr("data-href");

        var title = target.text().sanitized();

        if (href === "/recordings") {
            title = title + " Recording Group";
            args.RecGroup = target.text().sanitized();
        }

        History.pushState(args, title, href);

        return false;
    });

    $("#Content").on("click", ".mx-Clickable", function (ev) {
        var target = $(this);

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

        else if (target.hasClass("mx-Shrink")) {
            var box = getVideoParameters();
            if (box.baseW) {
                box.vid.attr("width", box.W - box.baseW / 2);
                box.vid.attr("height", box.H - box.baseH / 2);
            }
        }

        else if (target.hasClass("mx-Original")) {
            var box = getVideoParameters();
            if (box.baseW) {
                box.vid.attr("width", box.baseW);
                box.vid.attr("height", box.baseH);
            }
        }

        else if (target.hasClass("mx-Zoom")) {
            var box = getVideoParameters();
            if (box.baseW) {
                box.vid.attr("width", box.W + box.baseW / 2);
                box.vid.attr("height", box.H + box.baseH / 2);
            }
        }

        else if (target.hasClass("mx-Max")) {
            var box = getVideoParameters();
            if (box.baseW) {
                var ratio = document.width / box.baseW;
                box.vid.attr("width", document.width);
                box.vid.attr("height", box.baseH * ratio);
            }
        }

        else if (target.hasClass("mx-Move")) {
            var offset = Number(target.attr("data-offset"));
            var vid = $("#Content .nm-VideoBox");
            if (vid.length == 1) {
                vid[0].currentTime = vid[0].currentTime + offset;
            }
        }

        return false;
    });


    // ////////////////////////////////////////////////////////////////////////
    // WebSocket updates
    // ////////////////////////////////////////////////////////////////////////

    var buttonUpdatePending = false;

    function applyUpdate(event) {
        var State = History.getState();
        if (event.hasOwnProperty("Recordings") && State.cleanUrl.substr(-11) === "/recordings" && (event.Reset || event.Group === State.data.RecGroup)) {
            var insideTitle = State.data.hasOwnProperty("Title");
            if (event.Reset || (insideTitle && event.Title === State.data.Title) || (!insideTitle && event.Title === "*")) {
                loadCurrentView(State);
            }
        }

        else if (event.hasOwnProperty("Frontends")) {
            processFrontendChange(event);
        }

        else if (event.hasOwnProperty("RecordingGroups")) {
            buttonUpdatePending = true;
            $.get("/buttons", function (buttonList) {
                console.log("buttons update");
                console.log(buttonList);
                $("#Buttons").html(buttonList);
                $("#Buttons button").button();
                buttonUpdatePending = false;
            });
        }

        else if (event.Alert) {
            var oldAlert = $("#Footer p[data-Category = '" + event.Category + "']");
            if (oldAlert.length == 0 || !event.hasOwnProperty("Message") || oldAlert.text() !== event.Message) {
                // a new, unique alert
                oldAlert.slideUp("slow", function () { $(this).remove(); });
                if (!event.Cancel) {
                    var paragraph = $("<p>")
                        .attr("data-Category", event.Category)
                        .attr("class", "mx-" + event.Class)
                        .text(event.Message)
                        .prependTo("#Footer");
                    if (event.Decay) {
                        setTimeout(function () {
                            paragraph.slideUp("slow", function () { $(this).remove(); });
                        }, event.Decay * 1000);
                    }
                }
            }
        }
    }

    var webSocket = (function () {
        var wsSetup = function () {
            if (WebSocket) {
                var ws = new WebSocket('ws://' + window.location.hostname + ':6566/');
                if (!ws) {
                    console.log('web socket unavailable, retry in 6 seconds');
                    setTimeout(function () { webSocket(); }, 6000);
                }
                ws.onmessage = function (msg) {
                    console.log(msg.data);
                    applyUpdate($.parseJSON(msg.data));
                };
                ws.onclose = function () {
                    console.log('web socket closed, retry in 6 seconds');
                    setTimeout(function () { webSocket(); }, 6000);
                };
            }
        };
        wsSetup();
        return wsSetup;
    })();


    // ////////////////////////////////////////////////////////////////////////
    // Initialization
    // ////////////////////////////////////////////////////////////////////////

    $("#Buttons button").button();

    // save initial state so back button has somewhere to go
    History.pushState({ historyInit : true, RecGroup : currentRecGroup, VideoFolder : currentVideoFolder },
                      document.title, window.location.pathname);

});