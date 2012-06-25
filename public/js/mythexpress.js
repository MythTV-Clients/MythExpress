
var mxRec = function (img) { $(img).attr("src", "img/static.png"); };
var mxVid = function (img) { $(img).attr("src", "img/MoviePoster.png"); };

$(document).ready(function() {

    if (typeof console === 'undefined') {
        console = { };
        if (typeof console.log === 'undefined')
            console.log = function () { }
    }

    var infoDialog;
    var viewsMap;              // maps view name -> initial url
    var requestingMessage;     // html of clock with "Requesting..." message
    var updateStreamStatus;    // forward declaration

    // ////////////////////////////////////////////////////////////////////////
    // Helpers
    // ////////////////////////////////////////////////////////////////////////

    String.prototype.sanitized = function () {
        return this.replace(/[\n\r]/g, "").replace(/[ ]+$/, "");
    }

    var currentGroup = "Default";

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

    // helpful info:
    // https://developer.mozilla.org/en/DOM/Manipulating_the_browser_history
    // https://developer.mozilla.org/en/Using_Firefox_1.5_caching

    var History = window.History; // Note capital H for the History.js object

    function updateState(newData) {
        var curData = $.extend({ }, History.getState().data);
        curData.Title = document.title;
        var changed = false;
        for (var key in newData) {
            if (!curData.hasOwnProperty(key) || curData[key] != newData[key]) {
                curData[key] = newData[key];
                changed = true;
            }
        }
        if (changed) {
            var result = { };
            if (curData.hasOwnProperty("Title")) {
                result.Title = curData.Title;
                delete curData.Title;
            }
            result.Data = curData;
            return result;
        } else {
            return false;
        }
    }

    function getDataFromHeaders(headers) {
        var data = { };
        headers.split(/[\r\n]/).forEach(function (header) {
            var half = header.split(/[:][ ]/);
            if (half[0].substr(0,5) === "X-MX-") {
                data[half[0].substr(5)] = decodeURIComponent(escape(half[1]));
            }
        });
        return data;
    }

    var updateButtons;  // this is a forward reference for the function

    var inReplaceState = false;

    function loadCurrentView(State) {
        // console.log("get " + State.url);
        // console.log(State.data);
        if (State.url.substr(-8) === "/streams" && (State.data.hasOwnProperty("FileName") || State.data.hasOwnProperty("VideoId"))) {
            $("#Content").html(requestingMessage);
        } else {
            $("#Content").hide("blind", { }, 500);
        }
        $.get(State.url, State.data,
              function(markup, textStatus, jqXHR) {
                  $("#Content")  // promise() waits if hide is in progress
                      .promise().done(function () {
                          $("#Content")
                              .css("display","block")
                              .html(markup);

                          // console.log(jqXHR.getAllResponseHeaders());

                          var newState;
                          if (newState = updateState(getDataFromHeaders(jqXHR.getAllResponseHeaders()))) {
                              var newTitle = document.title;
                              if (newState.hasOwnProperty("Title")) {
                                  document.title = newTitle = newState.Title;
                              }
                              inReplaceState = true;
                              History.replaceState(newState.Data, newTitle, document.location.pathname);
                          }

                          $("#Title").text(document.title);

                          var curState = History.getState().data;
                          if (curState.hasOwnProperty("View") && curState.View !== $("#Buttons").attr("data-View")) {
                              updateButtons(curState.View);
                          }

                          if (markup.match(/mx-StreamList/)) {
                              setTimeout(updateStreamStatus, 5000);
                          }

                          var videoControls = $("#Content .mx-ControlBubble button");
                          if (videoControls.length > 0) {
                              videoControls.button();
                          }
                      });
              });
    }

    History.Adapter.bind(window, 'statechange', function () {
        if (inReplaceState) {
            inReplaceState = false;
        } else {
            loadCurrentView(History.getState());
        }
        return false;
    });


    // ////////////////////////////////////////////////////////////////////////
    // View management
    // ////////////////////////////////////////////////////////////////////////

    $("#Content").load(function () {
        console.log("onload called");
        // http://stackoverflow.com/questions/92720/jquery-javascript-to-replace-broken-images
        $("#Content img").each(function () {
            if (this.readyState === "uninitialized" || (typeof this.naturalWidth !== "undefined" && this.naturalWidth == 0)) {
                console.log("img/static");
                $(this).attr("src", "img/static.png");
            }
        });
    });

    

    updateButtons = function (newView) {
        var buttons = $("#Buttons");
        var view = typeof(newView) === "undefined" ? buttons.attr("data-View") : newView;
        $.get("/ui/buttons", { View : view }, function (buttonList) {
            $("#Buttons")
                .attr("data-View", view)
                .html(buttonList);
            $("#Buttons button").button();
        });
    };

    updateStreamStatus = function () {
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
                History.pushState(target.dataAttrs(["FileName"]),
                                  target.dataText(["Title"]).Title,
                                  "/watch/program");
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
                History.pushState(target.dataAttrs(["VideoId"]),
                                  "Loading&hellip;",
                                  "/watch/video");
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
                var pushData = target.dataAttrs(["StreamId"]);
                pushData.View = $("#Buttons").attr("data-View");
                History.pushState(pushData,
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

    $("#Header")
        .on("click", "#ViewsIcon", function () {
            $("#Views").removeClass("mx-Hidden");
            return false;
        })
        .on("click", "#BackButton", function () {
            History.back();
            return false;
        })
        .on("click", "button", function () {
            $("#Content").html("");

            var args = {
                View : $("#Buttons").attr("data-View")
            };
            var target = $(this);
            var href = target.attr("data-href");

            var title = target.text().sanitized();

            // console.log("button click " + title + " = " + href);

            if (href === "/recordings") {
                title = title + " Recording Group";
                args.Group = currentRecGroup = target.dataAttrs(["RecGroup"]).RecGroup;
                    //target.text().sanitized();
            } else if (href === "/properties") {
                title = title + " Recordings";
                args.Group = currentRecGroup = target.dataAttrs(["RecGroup"]).RecGroup;
            }

            History.pushState(args, title, href);

            return false;
        });

    $("#Views")
        .on("click", ".mx-ViewsBackground", function () {
            $("#Views").addClass("mx-Hidden");
            return false;
        })
        .on("click", ".mx-PopupItem", function () {
            var view = $(this).text().sanitized();
            $("#Views").addClass("mx-Hidden");
            // console.log("clicked " + view + " for /" + viewsMap[view]);
            History.pushState({ }, "Loading " + view + "\u2026", "/" + viewsMap[view]);
            return false;
        });

    $("#Content")
        .on("click", ".mx-Clickable", function (event) {
            var target = $(this);
            var isTopHalf = (event.offsetY * 2) < target.height();

            if (target.hasClass("mx-Folder")) {
                var showTitle = target.dataText(["Title"]).Title;
                // console.log(History.getState().data);
                var currentRecGroup = History.getState().data.Group;
                History.pushState(
                    {
                        Group : currentRecGroup,
                        Title : showTitle,
                        View : $("#Buttons").attr("data-View")
                    },
                    currentRecGroup + " • " + showTitle,
                    "/recordings");
            }

            else if (target.hasClass("mx-Recording")) {
                if (isTopHalf) {
                    History.pushState(target.dataAttrs(["FileName"]),
                                      target.dataAttrs(["Title"]).Title,
                                      "/streams");
                } else {
                    $("#InfoDialogContent").html("");
                    infoDialog
                        .dialog("option", "buttons", recordingButtons)
                        .dialog("open");
                    $.get("/recordinginfo", target.dataAttrs(["FileName"]),
                          function (info, textStatus, jqXHR) {
                              $("#InfoDialogContent").html(info);
                          });
                }
            }

            else if (target.hasClass("mx-VideoFolder")) {
                History.pushState(target.dataAttrs(["Group"]),
                                  document.title + " / " + target.dataText(["Title"]).Title,
                                  "/videos");
            }

            else if (target.hasClass("mx-Video")) {
                if (isTopHalf) {
                    History.pushState(target.dataAttrs(["VideoId"]),
                                      target.parent().dataText(["Title"]).Title,
                                      "/streams");
                } else {
                    $("#InfoDialogContent").html("");
                    infoDialog
                        .dialog("option", "buttons", videoButtons)
                        .dialog("open");
                    $.get("/videoinfo", target.dataAttrs(["VideoId"]),
                          function (info, textStatus, jqXHR) {
                              $("#InfoDialogContent").html(info);
                          });
                }
            }

            else if (target.hasClass("mx-StreamPreview")) {
                var pushData = target.dataAttrs(["StreamId"]);
                pushData.View = $("#Buttons").attr("data-View");
                History.pushState(pushData,
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
                    var newTime = vid[0].currentTime + offset;
                    if (newTime < 0) newTime = 0;
                    vid[0].currentTime = vid[0].currentTime + offset;
                }
            }

            return false;
        });


    // ////////////////////////////////////////////////////////////////////////
    // WebSocket updates
    // ////////////////////////////////////////////////////////////////////////

    function applyUpdate(event) {
        var State = History.getState();
        if (event.hasOwnProperty("Recordings") && State.cleanUrl.substr(-11) === "/recordings" && (event.Reset || event.Group === State.data.Group)) {
            var insideTitle = State.data.hasOwnProperty("Title");
            if (event.Reset || (insideTitle && event.Title === State.data.Title) || (!insideTitle && event.Title === "*")) {
                loadCurrentView(State);
            }
        }

        else if (event.hasOwnProperty("Frontends")) {
            processFrontendChange(event);
        }

        else if (event.hasOwnProperty("RecordingGroups")) {
            updateButtons();
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

    var webSocket = {
        showingOffline : false,
        showOffline : function () {
            if (!webSocket.showingOffline) {
                webSocket.showingOffline = true;
                applyUpdate({ Alert : true, Category : "MythExpress", Class : "Alert",
                              Message : "MythExpress is offline" });
            }
        },
        init : function () {
            if (WebSocket) {
                var ws = new WebSocket('ws://' + window.location.hostname + ':6566/');
                ws.onopen = function () {
                    applyUpdate({ Alert : true, Category : "MythExpress", Cancel : true });
                }
                ws.onmessage = function (msg) {
                    console.log(msg.data);
                    applyUpdate($.parseJSON(msg.data));
                    webSocket.showingOffline = false;
                };
                ws.onerror = function (event) {
                    console.log(event);
                    webSocket.showOffline();
                };
                ws.onclose = function (event) {
                    console.log('web socket closed, retry in 6 seconds');
                    webSocket.showOffline();
                    setTimeout(function () { webSocket.init(); }, 6000);
                };
            }
        }
    };
    webSocket.init();


    // ////////////////////////////////////////////////////////////////////////
    // Initialization
    // ////////////////////////////////////////////////////////////////////////

    $("#Buttons button").button();

    infoDialog = $("#InfoDialog").dialog({
        autoOpen : false,
        modal : true,
        dialogClass : "mx-InfoDialog",
        width : 800, height : 600,
        open : function (event, ui) {
            $("#InfoDialog").parent().find(".ui-dialog-buttonpane button:last").focus();
        }
    });

     $.get("/seconds", { Message : "Requesting" }, function (html) {
         requestingMessage = html;
     });

     $.get("/ui/views", function (viewsData) {
         viewsMap = viewsData.Map;
         // console.log(viewsMap);
         $("#ViewsPopup")
             .html(viewsData.Markup);
     });

    (function () {
        var context = $("#Context");
        if (context.length > 0) {
            context = JSON.parse(context.html());
            var newTitle = document.title;
            if (context.hasOwnProperty("Title")) {
                newTitle = context.Title;
                delete context.Title;
            }
            // save initial state so back button has somewhere to go
            History.pushState(context.View, newTitle, window.location.pathname);
            $("#Title").text(newTitle);
            updateButtons(context.View);
            // console.log("initial context");
            // console.log(History.getState());
        }
    })();

});