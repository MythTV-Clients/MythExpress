
var http = require('http');
var path = require('path');
var net = require('net');
var WebSocketServer = require('ws').Server;
var fs = require('fs');
var mdns = require('mdns');
var async = require('async');


// ////////////////////////////////////////////////////////////////////////
// Helpers
// ////////////////////////////////////////////////////////////////////////

var mythProtocolTokens = {
    "64" : "8675309J",
    "65" : "D2BB94C2",
    "66" : "0C0FFEE0",
    "67" : "0G0G0G0",
    "68" : "90094EAD",
    "69" : "63835135",
    "70" : "53153836",
    "71" : "05e82186",
    "72" : "D78EFD6F",
    "73" : "D7FE8D6F",
    "74" : "SingingPotato",
    "75" : "SweetRock",
    "Latest" : "75"
};

var traitOrder = {
    Bookmarked : 1,
    CutList    : 2,
    Movie      : 3,
    Preserved  : 4,
    Watched    : 5,
    Unwatched  : 6,
    Deleted    : 7
};

var slashPattern = new RegExp("[/]");

function titleCompare (t1,t2) {
    if (t1.substr(0,4) === "The ") t1 = t1.substr(4);
    if (t2.substr(0,4) === "The ") t2 = t2.substr(4);
    var t1lc = t1.toLowerCase(), t2lc = t2.toLowerCase();
    return t1lc > t2lc ? 1 : t1lc < t2lc ? -1 : t1 > t2 ? 1 : t1 < t2 ? -1 : 0;
}

function episodeCompare (t1,t2) {
    var t1Val = !!t1.Airdate ? t1.Airdate : (t1.StartTime || t1.SubTitle || t1.FileName);
    var t2Val = !!t2.Airdate ? t2.Airdate : (t2.StartTime || t2.SubTitle || t2.FileName);
    return t1Val === t2Val ? 0 : (t1Val > t2Val ? -1 : 1);
}

function videoCompare (v1,v2) {
    var t1 = v1.Title.toLowerCase();
    var t2 = v2.Title.toLowerCase();
    if (t1.substr(0,4) === "the ") t1 = t1.substr(4);
    if (t2.substr(0,4) === "the ") t2 = t2.substr(4);
    return t1 === t2 ? 0 : (t1 < t2 ? -1 : 1);
}

function traitCompare(t1,t2) {
    return traitOrder[t1] < traitOrder[t2] ? -1 : 1;
}

function stringCompare (g1,g2) {
    return g1.toLowerCase() > g2.toLowerCase() ? 1 : -1;
}

// similar to jQuery extend
function copyProperties (src, dst) {
    Object.keys(src).forEach(function (property) {
        if (src.hasOwnProperty(property)) { // don't copy properties from parent objects
            if (typeof(src[property]) === "object" && !src[property].hasOwnProperty("length")) {
                // property is an object but not an array
                if (!dst.hasOwnProperty(property))
                    dst[property] = { };
                copyProperties(src[property], dst[property]);
            } else {
                dst[property] = src[property];
            }
        }
    });
    return dst;
}

function getProgramFlags(programFlags) {
    return {
        InUse          : !!(programFlags & 0x00700000),
        InUsePlaying   : !!(programFlags & 0x00200000),
        CommercialFree : !!(programFlags & 0x00000800),
        HasCutlist     : !!(programFlags & 0x00000002),
        BookmarkSet    : !!(programFlags & 0x00000010),
        Watched        : !!(programFlags & 0x00000200),
        AutoExpirable  : !!(programFlags & 0x00000004),
        Preserved      : !!(programFlags & 0x00000400),
        Repeat         : !!(programFlags & 0x00001000),
        Duplicate      : !!(programFlags & 0x00002000),
        Reactivated    : !!(programFlags & 0x00004000),
        DeletePending  : !!(programFlags & 0x00000080)
    };
}

function getVideoProps(propMask) {
    return {
        HDTV       : !!(propMask & 0x01),
        Widescreen : !!(propMask & 0x02),
        AVC        : !!(propMask & 0x04),
        "720p"     : !!(propMask & 0x08),
        "1080p"    : !!(propMask & 0x10),
        Damaged    : !!(propMask & 0x20)
    };
}

function filterIPv4(addressList) {
    var ip4 = [ ];
    addressList.forEach(function (address) {
        if (address.match(/^[.0-9]+$/))
            ip4.push(address);
    });
    return ip4;
}

function hostFromService(service) {
    var parts = service.name.split(/[ ]/);
    return parts[parts.length - 1];
}


// ////////////////////////////////////////////////////////////////////////
// Globals
// ////////////////////////////////////////////////////////////////////////

var backends = [ ];

module.exports = function(args) {

    var myth = {
        connected : false,
        connectPending : false,
        isUp : false,
        bonjour : undefined
    };

    var frontends = {
        byHost : { },
        byName : { }
    };

    var backendProtocol = mythProtocolTokens.Latest;

    var backend = {
        host : "127.0.0.1",
        customHost : false,
        port : 6544,
        method : 'GET',
        headers : { 'content-type': 'text/plain',
                    'connection': 'keep-alive',
                    'accept': 'application/json' }
    };

    var viewButtons = {
        Programs : [ ],
        Properties : [ ]
    };

    var byRecGroup = { "All" : [ ], "Default" : [ ] };
    var byFilename = { };
    var byChanId = { };
    var sortedTitles = { };
    var groupNames = [ ];
    var traitNames = [ ];

    var byVideoFolder = { };
    var byVideoId = [ ];

    if (process.env["MX_HOST"]) {
        backend.host = process.env["MX_HOST"];
        backend.customHost = true;
    }
    if (!!args && args.host) {
        backend.host = args.host;
        backend.customHost = true;
    }


    function reqJSON (options, callback) {
        var allOptions = { };
        Object.keys(backend).forEach(function (option) {
            allOptions[option] = backend[option];
        });
        Object.keys(options).forEach(function (option) {
            allOptions[option] = options[option];
        });
        var req = http.request(allOptions, function (reply) {
            var response = "";
            reply.setEncoding('utf8');
            reply.on('data', function (chunk) {
                response += chunk;
                //response += chunk.substr(0, chunk.length-2);
            });

            reply.on('end', function() {
                try {
                    callback(JSON.parse(response.replace(/[\r\n]/g,'')));
                } catch (err) {
                    console.log(err);
                    callback({ });
                }
                //callback(JSON.parse(response));
                response = undefined;
            })
        });
        req.end();
    }


    function toUTCString(localTs) {
        if (backendProtocol > "74")
            return localTs.getFullYear() + "-" + ("0" + (localTs.getMonth()+1)).substr(-2) + "-" + ("0" + localTs.getDate()).substr(-2) + "T" + ("0" + localTs.getHours()).substr(-2) + ":" + ("0" + localTs.getMinutes()).substr(-2) + ":" + ("0" + localTs.getSeconds()).substr(-2);
        else
            return localTs.getUTCFullYear() + "-" + ("0" + (localTs.getUTCMonth()+1)).substr(-2) + "-" + ("0" + localTs.getUTCDate()).substr(-2) + "T" + ("0" + localTs.getUTCHours()).substr(-2) + ":" + ("0" + localTs.getUTCMinutes()).substr(-2) + ":" + ("0" + localTs.getUTCSeconds()).substr(-2);
    }


    function localFromUTCString(utcString) {
        if (backendProtocol > "74")
            return utcString;

        var utc = new Date();

        utc.setUTCFullYear(Number(utcString.substr(0,4)),
                           Number(utcString.substr(5,2))-1,
                           Number(utcString.substr(8,2)));
        utc.setUTCHours(Number(utcString.substr(11,2)),
                        Number(utcString.substr(14,2)),
                        Number(utcString.substr(17,2)));

        return utc.getFullYear() + "-" + ("0" + (utc.getMonth()+1)).substr(-2) + "-" + ("0" + utc.getDate()).substr(-2) + "T" + ("0" + utc.getHours()).substr(-2) + ":" + ("0" + utc.getMinutes()).substr(-2) + ":" + ("0" + utc.getSeconds()).substr(-2);
    }


    // ////////////////////////////////////////////////////////////////////////
    // events to the browser
    // ////////////////////////////////////////////////////////////////////////

    var eventSocket = (function () {

        var wss = new WebSocketServer({ host : '0.0.0.0', port : 6566 });
        wssClients = [ ];

        function blast(msg, clientNum) {
            var msgStr = JSON.stringify(msg);
            console.log('blast ' + msgStr);
            if (typeof(clientNum) == "undefined")
                clientNum = -1;
            var closed = [ ];
            wssClients.forEach(function (webSocket, idx) {
                if (webSocket.isAlive) {
                    if (clientNum == -1 || idx == clientNum)
                        webSocket.send(msgStr);
                } else {
                    closed.unshift(idx);
                }
            });
            closed.forEach(function (clientIdx) {
                wssClients.remove(clientIdx);
            });
        }

        var recChange = { };
        var inReset = false;
        var recordingsWereReset = false;
        var shutdownSeconds = -1;

        var vidChange = false;
        var recGroupsChanged = false;

        var changeAPI = {
            resettingRecordings : function (startingReset) {
                if (inReset && !startingReset)
                    recordingsWereReset = true;
                inReset = startingReset;
            },

            isDoingReset : function () {
                return inReset;
            },

            recordingChange : function (change) {
                if (!inReset) {
                    if (!change.title)
                        change.title = "*";
                    if (!recChange[change.group])
                        recChange[change.group] = { };
                    recChange[change.group][change.title] = true;
                }
            },

            videoChange : function () {
                vidChange = true;
            },

            recGroupChange : function (grp) {
                recGroupsChanged = true;
            },

            groupsDidChange : function () {
                return recGroupsChanged;
            },

            frontendChange : function () {
                blast({ Frontends : Object.keys(frontends.byHost) });
            },

            groupChanges : function () {
                return recChange;
            },

            sendChanges : function () {
                if (!inReset) {
                    if (recordingsWereReset) {
                        blast({ Recordings : true, Reset : true });
                        recordingsWereReset = false;
                    } else {
                        var rc = recChange;
                        var grpList = [ ];
                        for (var grp in recChange) {
                            var titleList = [ ];
                            for (var title in recChange[grp]) {
                                blast({ Recordings : true, Group : grp, Title : title});
                                titleList.push(title);
                            }
                            titleList.forEach(function (title) { delete rc[grp][title]; });
                        }
                        grpList.slice(2).forEach(function (grp) { if (rc[grp].length == 0) delete rc[grp]; });
                    }

                    if (recGroupsChanged) {
                        blast({ RecordingGroups : true });
                        recGroupsChanged = false;
                    }
                }

                if (vidChange) {
                    blast({ Videos : true });
                    vidChange = false;
                }
            },

            alertShutdown : function (seconds, clientNum) {
                shutdownSeconds = seconds;
                if (seconds >= 0) {
                    blast({ Alert : true, Category : "Servers", Class : "Alert",
                            Message : myth.bonjour.name + " will shut down in " + seconds + " seconds"},
                          clientNum);
                } else {
                    blast({ Alert : true, Category : "Servers", Class : "Alert", Decay : 5,
                            Message : "Shutdown cancelled" });
                }
            },

            alertOffline : function (clientNum) {
                blast({ Alert : true, Category : "Servers", Class : "Alert",
                        Message : "MythTV" + " is offline"},
                      clientNum);
            },

            alertConnecting : function (clientNum) {
                blast({ Alert : true, Category : "Servers", Class : "Info",
                        Message : "MythExpress is loading from " + myth.bonjour.name },
                      clientNum);
            },

            alertConnected : function () {
                blast({ Alert : true, Category : "Servers", Cancel : true });
            },

            alertConnection : function (clientNum) {
                blast({ Alert : true, Category : "Servers", Class : "Info", Decay : 5,
                        Message : "Connected to " + myth.bonjour.fullname },
                      clientNum);
            },

            alertProtocol : function (protocol) {
                blast({ Alert : true, Category : "Servers", Class : "Alert",
                        Message : myth.bonjour.fullname + " uses unrecognized protocol '" + protocol + "'" });
            },

            alertNoServers : function (clientNum) {
                blast({ Alert : true, Category : "Servers", Class : "Alert",
                        Message : "There is no MythTV server available" },
                     clientNum);
            }
        };

        wss.on('connection', function(ws) {
            ws.isAlive = true;
            ws.on('close', function () {
                ws.isAlive = false;
                console.log('ws client closed');
            });
            wssClients.push(ws);
            console.log('new client (' + wssClients.length + ')');

            if (false && backends.length == 0)
                changeAPI.alertNoServers(wssClients.length-1);
            else if (myth.connectPending)
                changeAPI.alertConnecting(wssClients.length-1);
            else if (myth.connected && backends.length > 1)
                changeAPI.alertConnected(wssClients.length-1);
            else if (!myth.isUp)
                changeAPI.alertOffline(wssClients.length-1);
            else if (shutdownSeconds >= 0)
                changeAPI.alertShutdown(shutdownSeconds, wssClients.length-1);
        });

        return changeAPI;

    })();


    // ////////////////////////////////////////////////////////////////////////
    // data model maintenance
    // ////////////////////////////////////////////////////////////////////////

    var mythMessageHandler = (function () {

        function getChanKey(arg1, arg2) {
            if (typeof(arg1) === "object")
                return arg1.Channel.ChanId + ' ' + localFromUTCString(arg1.Recording.StartTs);
            else
                return arg1 + ' ' + arg2;
        }

        function eventTimeToString(eventTime, override) {
            var t = new Date(eventTime * 1000);
            if (backendProtocol > "74" && !override)
                return t.getFullYear() + "-" + ("0" + (t.getMonth()+1)).substr(-2) + "-" + ("0" + t.getDate()).substr(-2) + "T" + ("0" + t.getHours()).substr(-2) + ":" + ("0" + t.getMinutes()).substr(-2) + ":" + ("0" + t.getSeconds()).substr(-2);
            else
                return t.getUTCFullYear() + "-" + ("0" + (t.getUTCMonth()+1)).substr(-2) + "-" + ("0" + t.getUTCDate()).substr(-2) + "T" + ("0" + t.getUTCHours()).substr(-2) + ":" + ("0" + t.getUTCMinutes()).substr(-2) + ":" + ("0" + t.getUTCSeconds()).substr(-2);
        }

        function addRecordingToRecGroup (recording, recGroup) {
            if (!byRecGroup.hasOwnProperty(recGroup)) {
                byRecGroup[recGroup] = { };
                eventSocket.recGroupChange(recGroup);
            }
            var groupRecordings = byRecGroup[recGroup];
            if (!byRecGroup[recGroup].hasOwnProperty(recording.Title)) {
                byRecGroup[recGroup][recording.Title] = [ ];
                eventSocket.recordingChange({ group : recGroup});
            }
            eventSocket.recordingChange({ group : recGroup, title : recording.Title});
            byRecGroup[recGroup][recording.Title].push(recording);
        }

        function delRecordingFromRecGroup (recording, recGroup) {
            if (byRecGroup.hasOwnProperty(recGroup) && byRecGroup[recGroup].hasOwnProperty(recording.Title)) {
                var episodes = byRecGroup[recGroup][recording.Title];

                var found = false
                for (i = 0; !found && i < episodes.length; i++) {
                    if (episodes[i].FileName === recording.FileName) {
                        found = true;
                        episodes.remove(i);
                    }
                }

                if (found) {
                    eventSocket.recordingChange({ group : recGroup, title : recording.Title});

                    if (episodes.length < 2) {
                        eventSocket.recordingChange({ group : recGroup });
                        if (episodes.length == 0) {
                            console.log('that was the last episode');
                            delete byRecGroup[recGroup][recording.Title];
                            if (Object.keys(byRecGroup[recGroup]).length == 0) {
                                console.log('delete rec group ' + recGroup);
                                delete byRecGroup[recGroup];
                                eventSocket.recGroupChange(recGroup);
                            }
                        }
                    }
                }
            }
        }

        function assignProperties(program) {
            var mx = { recGroups : { }, traits : { } };

            var flags = getProgramFlags(program.ProgramFlags);

            if (program.Recording.RecGroup === "Deleted") {
                mx.traits.Deleted = true;
            } else {
                mx.recGroups.All = true;
                if (program.Recording.hasOwnProperty("RecGroup"))
                    mx.recGroups[program.Recording.RecGroup] = true;

                if (flags.BookmarkSet) mx.traits.Bookmarked = true;
                if (flags.HasCutlist) mx.traits.CutList = true;
                if (flags.Preserved) mx.traits.Preserved = true;
                if (flags.Watched) mx.traits.Watched = true;
                else mx.traits.Unwatched = true;
                if (program.hasOwnProperty("ProgramId") && program.ProgramId.length > 0 && program.ProgramId.substr(0,2) === "MV") mx.traits.Movie = true;
            }

            program.ProgramFlags_ = flags;
            program.mx = mx;
        }

        function emptyProgram (fileName) {
            var empty = {
                Title : "",
                StartTime : undefined,
                ProgramFlags : 0,
                Recording : { RecGroup : undefined },
                FileName : fileName
            };
            assignProperties(empty);
            return empty;
        }

        var doLog = false;

        function applyProgramUpdate(newProg) {

            var oldProg = { }, isExistingProgram;

            if (isExistingProgram = byFilename.hasOwnProperty(newProg.FileName)) {
                copyProperties(byFilename[newProg.FileName], oldProg);
                copyProperties(newProg, byFilename[newProg.FileName]);
                newProg = byFilename[newProg.FileName];
            } else {
                oldProg = emptyProgram();
                byFilename[newProg.FileName] = newProg;
                byChanId[getChanKey(newProg)] = newProg.FileName;
            }

            assignProperties(newProg);

            var oldGroups = Object.keys(oldProg.mx.recGroups).concat(Object.keys(oldProg.mx.traits));
            var newGroups = Object.keys(newProg.mx.recGroups).concat(Object.keys(newProg.mx.traits));

            var oldMap = { }, newMap = { };
            oldGroups.forEach(function (group) { oldMap[group] = true; });
            newGroups.forEach(function (group) { newMap[group] = true; });

            if (oldProg.Title != newProg.Title) {
                // remove from all groups under the old title and
                // readd under the new title
                if (doLog) console.log('  title change ' + oldProg.title + " => " + newProg.Title
                                       + " (" + newProg.FileName + ")");
                if (isExistingProgram) {
                    oldGroups.forEach(function (group) {
                        if (doLog) console.log('  del from ' + group);
                        delRecordingFromRecGroup(oldProg, group);
                    });
                }
                newGroups.forEach(function (group) {
                    if (doLog) console.log('  add from ' + group);
                    addRecordingToRecGroup(newProg, group);
                });
            } else {
                // remove from groups not appearing in the new and
                // add to groups that weren't in the old list
                //console.log("old groups / new groups for existing prog? " + isExistingProgram);
                //console.log(oldGroups);
                //console.log(newGroups);
                oldGroups.forEach(function (group) {
                    if (!newMap.hasOwnProperty(group)) {
                        if (doLog) console.log('  del from ' + group);
                        delRecordingFromRecGroup(oldProg, group);
                    }
                });
                newGroups.forEach(function (group) {
                    if (!oldMap.hasOwnProperty(group)) {
                        if (doLog) console.log('  add from ' + group);
                        addRecordingToRecGroup(newProg, group);
                    }
                });
            }

        }

        // new update events can come before we've processed the GetRecorded request
        var pendingRetrieves = { };

        function takeAndAddRecording(recording, override) {
            var chanKey = getChanKey(recording);
            if (override || !pendingRetrieves.hasOwnProperty(chanKey)) {
                doLog = true;
                applyProgramUpdate(recording);
                doLog = false;
                delete pendingRetrieves[chanKey];
            } else console.log("    ignored due to pending retrieve");
        }

        function retrieveAndAddRecording (chanId, startTs) {
            var chanKey = getChanKey(chanId, startTs);
            if (!pendingRetrieves.hasOwnProperty(chanKey)) {
                pendingRetrieves[chanKey] = true;
                console.log('retrieveAndAddRecording /Dvr/GetRecorded?ChanId=' + chanId + "&StartTime=" + startTs);
                reqJSON(
                    {
                        path : '/Dvr/GetRecorded?ChanId=' + chanId + "&StartTime=" + startTs
                    },
                    function (response) {
                        //console.log('retrieveAndAddRecording');
                        //console.log(response);
                        takeAndAddRecording(response.Program, true);
                    });
            } else console.log("    ignored due to pending retrieve");
        };

        function deleteByChanId (chanKey) {
            if (byChanId.hasOwnProperty(chanKey)) {
                var fileName = byChanId[chanKey];

                if (byFilename.hasOwnProperty(fileName)) {
                    var prog = byFilename[fileName];
                    console.log("deleted dangling program " + prog.Title + " " + prog.StartTime);
                    if (prog.hasOwnProperty("mx")) {
                        for (var group in prog.mx.recGroups) {
                            if (doLog) console.log('  del from ' + group);
                            delRecordingFromRecGroup(prog, group);
                        };
                        for (var flag in prog.mx.ProgramFlags_) {
                            if (prog.mx.ProgramFlags_[flag]) {
                                if (doLog) console.log('  del from ' + group);
                                delRecordingFromRecGroup(prog, group);
                            }
                        };
                    } else {
                        // clean out any possible straggler records
                        var prog = emptyProgram(fileName);
                        groupNames.concat(trainNames).forEach(function (group) {
                            delRecordingFromRecGroup(emptyProgram, group);
                        });
                    }

                    delete byFilename[fileName];
                }

                // get rid of stranded streams here until the BE does it
                reqJSON({ path : "/Content/GetFilteredLiveStreamList?FileName=" + byChanId[chanKey] },
                        function (reply) {
                            reply.LiveStreamInfoList.LiveStreamInfos.forEach(function (stream) {
                                console.log("remove stream " + stream.Id);
                                reqJSON({ path : "/Content/RemoveLiveStream?Id=" + stream.Id },
                                        function (reply) { }
                                       );
                            });
                        }
                       );

                delete byChanId[chanKey];
            }
        }

        function recordingListChange (change, program) {
            if (change[0] === "ADD") {
                var chanId = change[1], startTs = change[2];
                console.log('add ' + chanId + ' / ' + startTs);
                retrieveAndAddRecording(chanId, startTs)
            }

            else if (change[0] === "UPDATE") {
                console.log("UPDATE " + program.Title + " " + program.StartTime + " " + program.SubTitle);
                //console.log(program);
                takeAndAddRecording(program);
            }

            else if (change[0] === "DELETE") {
                // deletes are typically handled with update's
                // change to recgroup = Deleted but here we handle
                // other delete paths such as expiry.
                var chanId = change[1], startTs = change[2];
                deleteByChanId(chanId + ' ' + startTs);
            }

            else {
                console.log('unhandled program change: ' + change);
                console.log(program);
            }
        }

        function updateStructures() {
            var pendingChanges = eventSocket.groupChanges();
            for (var group in pendingChanges) {
                if (byRecGroup.hasOwnProperty(group)) {
                    for (var title in pendingChanges[group]) {
                        if (title === "*") {
                            sortedTitles[group] = Object.keys(byRecGroup[group]).sort(titleCompare);
                        } else {
                            if (byRecGroup[group].hasOwnProperty(title)) {
                                byRecGroup[group][title].sort(episodeCompare);
                            }
                        }
                    }
                } else {
                    if (sortedTitles.hasOwnProperty(group)) {
                        delete sortedTitles[group];
                    }
                }
            }

            if (eventSocket.groupsDidChange()) {
                groupNames.length = 0;
                traitNames.length = 0;

                for (var group in byRecGroup) {
                    if (traitOrder.hasOwnProperty(group)) {
                        traitNames.push(group);
                    } else if (group !== "Default" && group !== "Recordings" && group !== "All") {
                        groupNames.push(group);
                    }
                };

                groupNames.sort(stringCompare);
                if (groupNames.length > 1) {
                    groupNames.unshift("Default");
                    groupNames.unshift("All");
                } else {
                    groupNames.unshift("Recordings");
                }

                traitNames.sort(traitCompare);

                viewButtons.Programs.length = 0;
                viewButtons.Properties.length = 0;

                groupNames.forEach(function (groupName) {
                    viewButtons.Programs.push({
                        Class : "mx-RecGroup",
                        href : "/recordings",
                        recGroup : groupName,
                        Title : groupName
                    });
                });

                viewButtons.Programs.push({
                    Class : "mx-Videos",
                    href : "/videos",
                    Title : "Videos"
                });
                viewButtons.Programs.push({
                    Class : "mx-Streams",
                    href : "/streams",
                    Title : "Streams"
                });

                traitNames.forEach(function (traitName) {
                    viewButtons.Properties.push({
                        Class : "mx-RecGroup",
                        href : "/properties",
                        recGroup : traitName,
                        Title : traitName
                    });
                });
                viewButtons.Properties.push({
                    Class : "mx-Streams",
                    href : "/streams",
                    Title : "Streams"
                });
            }
        }

        function init () {
            async.auto({

                alertClients : function (finished) {
                    eventSocket.alertConnecting();
                    eventSocket.resettingRecordings(true);
                    finished(null);
                },

                resetStructures : [
                    "alertClients",
                    function (finished) {
                        Object.keys(sortedTitles).forEach(function (group) {
                            delete sortedTitles[group];
                        });

                        byRecGroup.All = [ ];
                        byRecGroup.Default = [ ];
                        byRecGroup.Recordings = byRecGroup.Default;  // an alias for when we have only one group

                        Object.keys(byFilename).forEach(function (fileName) {
                            delete byFilename[fileName];
                        });

                        Object.keys(byVideoFolder).forEach(function (folder) {
                            delete byVideoFolder[folder];
                        });
                        byVideoId.length = 0;

                        byVideoFolder["/"] = { Title : "Videos", List : [ ] };

                        finished(null);
                    }
                ],

                loadRecordings : [
                    "resetStructures",
                    function (finished) {
                        reqJSON(
                            { path : "/Dvr/GetRecordedList" },
                            function (pl) {
                                pl.ProgramList.Programs.forEach(function (prog) {
                                    applyProgramUpdate(prog);
                                });

                                Object.keys(byRecGroup).forEach(function (group) {
                                    sortedTitles[group] = Object.keys(byRecGroup[group]).sort(titleCompare);
                                    Object.keys(byRecGroup[group]).forEach(function (title) {
                                        byRecGroup[group][title].sort(episodeCompare);
                                    });
                                    console.log(group + ' ' + Object.keys(byRecGroup[group]).length);
                                });

                                finished(null);
                            });
                    }],

                loadVideos : [
                    "resetStructures",
                    function (finished) {
                        reqJSON(
                            { path : '/Video/GetVideoList' },
                            function (videos) {
                                videos.VideoMetadataInfoList.VideoMetadataInfos.forEach(function (video) {
                                    byVideoId[video.Id] = video;
                                    byFilename[video.FileName] = video;
                                    var curPath = "";
                                    var curList = byVideoFolder["/"];
                                    path.dirname(video.FileName).split(slashPattern).forEach(function (folder) {
                                        if (folder !== ".") {
                                            var newPath = curPath + "/" + folder;
                                            var newList = byVideoFolder[newPath];
                                            if (!newList) {
                                                newList = { Title : folder, List : [ ], VideoFolder : newPath };
                                                byVideoFolder[newPath] = newList;
                                                curList.List.push(newList);
                                            }
                                            curPath = newPath;
                                            curList = newList;
                                        }
                                    });
                                    curList.List.push(video);
                                });

                                Object.keys(byVideoFolder).forEach(function (path) {
                                    byVideoFolder[path].List.sort(videoCompare);
                                });

                                eventSocket.videoChange();

                                finished(null);
                            });

                        finished(null);
                    }
                ],

                initializeFinished : [
                    "loadRecordings", "loadVideos",
                    function (finished) {
                        mythMessageHandler.updateStructures();
                        eventSocket.resettingRecordings(false);
                        eventSocket.alertConnected();
                        eventSocket.sendChanges();
                        finished(null);
                    }
                ]
            });
        }

        var pullProgramInfo = function (message) {
            program = { };

            program.Title = message.shift();
            program.SubTitle = message.shift();
            program.Description = message.shift();
            if (backendProtocol >= "67") {
                program.Season = message.shift();
                program.Episode = message.shift();
            }
            program.Category = message.shift();
            program.Channel = { };
            program.Channel.ChanId = message.shift();
            program.Channel.ChanNum = message.shift();
            program.Channel.CallSign = message.shift();
            program.Channel.ChanName = message.shift();
            program.FileName = message.shift();
            program.FileSize = message.shift();
            program.StartTime = eventTimeToString(message.shift(), true);
            program.EndTime = eventTimeToString(message.shift(), true);
            program.FindId = message.shift();
            program.HostName = message.shift();
            program.SourceId = message.shift();
            program.CardId = message.shift();
            program.Channel.InputId = message.shift();
            program.Recording = { };
            program.Recording.Priority = message.shift();
            program.Recording.Status = message.shift();
            program.Recording.RecordId = message.shift();
            program.Recording.RecType = message.shift();
            program.Recording.DupInType = message.shift();
            program.Recording.DupMethod = message.shift();
            program.Recording.StartTs = eventTimeToString(message.shift(), true);
            program.Recording.EndTs = eventTimeToString(message.shift(), true);
            program.ProgramFlags = message.shift();
            program.ProgramFlags_ = getProgramFlags(program.ProgramFlags);
            program.Recording.RecGroup = message.shift();
            program.OutputFilters = message.shift();
            program.SeriesId = message.shift();
            program.ProgramId = message.shift();
            if (backendProtocol >= "67") {
                program.Inetref = message.shift();
            }
            program.LastModified = eventTimeToString(message.shift(), true);
            program.Stars = message.shift();
            program.Airdate = message.shift();
            program.PlayGroup = message.shift();
            program.Recording.Priority2 = message.shift();
            program.ParentId = message.shift();
            program.StorageGroup = message.shift();
            program.AudioProps = message.shift();
            program.VideoProps = message.shift();
            program.SubProps = message.shift();
            program.Year = message.shift();

            return program;
        };


        function handleMessage(message) {
            if (message[0].substr(0,13) === "SYSTEM_EVENT ") {
                var args = message[0].split(/ /);
                args.shift();
                var event = { };
                event.name = args.shift();
                while (args.length > 0) {
                    var data = args.shift();
                    event[data.toLowerCase()] = args.shift();
                }

                if (event.name === "REC_EXPIRED") {
                    console.log(event);
                    deleteByChanId(event.chanid + ' ' + event.starttime);
                }

                else if (event.name === "CLIENT_CONNECTED" ||
                    event.name === "CLIENT_DISCONNECTED" ||
                    event.name === "SCHEDULER_RAN" ||
                    event.name === "SCHEDULE_CHANGE" ||
                    event.name === "REC_PENDING" ||
                    event.name === "REC_STARTED" ||
                    event.name === "REC_FINISHED" ||
                    event.name === "REC_DELETED") {
                    console.log('Ignored System event:');
                    console.log(event);
                    // do nothing
                }

                else {
                    console.log('System event:');
                    console.log(event);
                }
            }

            else if (message[0].substr(0,20) === "SYSTEM_EVENT_RESULT ") {
            }

            else {
                var head = message[0].split(/[ ]/);
                var msgType = head[0];
                if (msgType === "RECORDING_LIST_CHANGE") {
                    var change = message.shift().substring(22).split(/[ ]/);
                    var changeType = change[0];
                    var program = pullProgramInfo(message);
                    console.log("RECORDING_LIST_CHANGE " + changeType);
                    //console.log(change);
                    //console.log(program);
                    recordingListChange(change,program);
                }

                else if (msgType === "SHUTDOWN_COUNTDOWN") {
                    eventSocket.alertShutdown(head[1]);
                }

                else if (msgType === "UPDATE_FILE_SIZE" ||
                         msgType === "ASK_RECORDING" ||
                         msgType === "COMMFLAG_START" ||
                         msgType === "COMMFLAG_UPDATE" ||
                         msgType === "SCHEDULE_CHANGE") {
                }


                else {
                    console.log('Non system event:');
                    console.log(message);
               }
            }
        }

        return {
            init : init,
            handleMessage : handleMessage,
            updateStructures : updateStructures
        };

    })();


    // ////////////////////////////////////////////////////////////////////////
    // events from the backend
    // ////////////////////////////////////////////////////////////////////////

    function backendConnect(mythMessageHandler) {

        function mythCommand(args) {
            var cmd = args.join(' ');
            var buf = new Buffer(cmd);
            var len = new Buffer((cmd.length + "        ").substr(0,8));
            var cmdBuf = new Buffer(8 + buf.length);
            len.copy(cmdBuf);
            buf.copy(cmdBuf, 8);
            return cmdBuf;
        }

        var socket = new net.Socket();

        var heartbeatSeconds = 6;
        var lastConnect = new Date();

        function makeConnection() {
            console.log('open myth events connection ' + backend.host + ' ' + lastConnect.toString());
            socket.connect(6543, backend.host);
            lastConnect = new Date();
        }

        function doConnect() {
            if (myth.isUp && !myth.connectPending) {
                myth.connectPending = true;
                var msecToWait = (heartbeatSeconds * 1000) - ((new Date()).valueOf() - lastConnect.valueOf());
                if (msecToWait < 0) msecToWait = 0;
                setTimeout(makeConnection, msecToWait);
            }
        }

        var inPrefix = true;
        var needed = 8;

        var incomingLen = 0;
        var incoming = new Buffer(65535);

        //socket.on('timeout', function () {
        //    console.log('myth event socket timeout/refresh');
        //    socket.write(mythCommand(["OK"]));
        //});

        socket.on('close', function (hadError) {
            myth.connected = false;
            console.log('socket closed (withError: ' + hadError + ')');
            doConnect();
        });

        socket.on('end', function () {
            myth.connected = false;
            console.log('myth event socket end');
            doConnect();
        });

        socket.on('error', function (err) {
            console.log('myth event socket error');
            console.log(err);
            if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
                // probably the myth host is down
                myth.connected = false;
                myth.bonjourService.restart();
            }
        });

        socket.on('data', function(data) {

            data.copy(incoming, incomingLen);
            incomingLen += data.length;

            while (incomingLen >= needed) {

                var message = incoming.slice(0, needed).toString('utf8');
                if (needed < incomingLen)
                    incoming.copy(incoming, 0, needed, incomingLen);
                incomingLen -= needed;

                if (inPrefix) {
                    inPrefix = false;
                    needed = Number(message);
                } else {

                    inPrefix = true;
                    needed = 8;

                    var response = message.split(/\[\]:\[\]/);

                    if (response[0] === "BACKEND_MESSAGE") {
                        response.shift();
                        mythMessageHandler.handleMessage(response);
                    }

                    else if (response[0] === "ACCEPT") {
                        socket.write(mythCommand(["ANN", "Monitor", "MythExpress.EventListener", 1]));
                        mythMessageHandler.init();
                    }

                    else if (response[0] === "REJECT") {
                        backendProtocol = response[1];
                        if (mythProtocolTokens[backendProtocol]) {
                            doConnect();
                        } else {
                            console.log("Unknown protocol version '" + backendProtocol + "'");
                            changeAPI.alertProtocol(backendProtocol);
                        }
                    }

                }
            }

            if (!eventSocket.isDoingReset()) {
                mythMessageHandler.updateStructures();
                eventSocket.sendChanges();
            }

        });

        socket.on('connect', function () {
            myth.connectPending = false;
            myth.connected = true;

            console.log('myth event socket connect');

            socket.setKeepAlive(true, heartbeatSeconds * 1000);
            socket.write(mythCommand(["MYTH_PROTO_VERSION", backendProtocol, mythProtocolTokens[backendProtocol]]));

        });

        doConnect();

    }


    // ////////////////////////////////////////////////////////////////////////
    // Bonjour
    // ////////////////////////////////////////////////////////////////////////

    myth.bonjourService = (function () {
        var backendBrowser = mdns.createBrowser(mdns.tcp('mythbackend'));

        backendBrowser.on('serviceUp', function(service) {
            //console.log("mythtv up: ", service.name);
            if (!myth.connected) {
                if (myth.affinity && myth.affinity !== service.host)
                    return;
                myth.isUp = true;
                var addr = filterIPv4(service.addresses);
                if (addr.length > 0) {
                    myth.bonjour = service;
                    myth.up = true;
                    backend.host = addr[0];
                    console.log(service.name + ': ' + backend.host);
                    backendConnect(mythMessageHandler);
                }
            }
        });

        backendBrowser.on('serviceDown', function(service) {
            //console.log("mythtv down: ", service.name);
            if (myth.connected) {
                myth.isUp = service.name === myth.bonjour.name;
            }
        });

        backendBrowser.start();

        var frontendBrowser = mdns.createBrowser(mdns.tcp('mythfrontend'));

        frontendBrowser.on('serviceUp', function(service) {
            //console.log("frontend up: ", service);
            var addr = filterIPv4(service.addresses);
            if (addr.length > 0) {
                service.ipv4 = addr[0];
                service.shortHost = hostFromService(service);
                frontends.byName[service.name] = service;
                frontends.byHost[service.shortHost] = { fullname : service.name, address : addr[0] };
                eventSocket.frontendChange();
            }
        });

        frontendBrowser.on('serviceDown', function(service) {
            //console.log("frontend down: ", service);
            if (frontends.byName.hasOwnProperty(service.name)) {
                var serv = frontends.byName[service.name];
                delete frontends.byHost[serv.shortHost];
                delete frontends.byName[serv.name];
                eventSocket.frontendChange();
            }
        });

        frontendBrowser.start();

        return {
            restart : function () {
                myth.up = false;
                Object.keys(frontends.byName).forEach(function (name) {
                    delete frontends.byHost[frontends.byName[name].shortHost];
                    delete frontends.byName[name];
                });

                backendBrowser.stop();
                backendBrowser.start();
                backendBrowser.stop();
                backendBrowser.start();
            }
        };
    })();


    // ////////////////////////////////////////////////////////////////////////
    // Frontend Control
    // ////////////////////////////////////////////////////////////////////////

    frontendControl = (function () {
        return {
            SendMessage : function (host, message) {
                if (frontends.byHost.hasOwnProperty(host)) {

                    var fe = frontends.byName[frontends.byHost[host].fullname];

                    (function (host) {
                        var socket = new net.Socket();
                        var reply = "";
                        socket.on('data', function (data) {
                            reply = reply + data.toString();
                            if (reply.match(/OK/)) {
                                socket.end("exit\n");
                            } else if (reply.match(/ERROR/)) {
                                console.log(message);
                                console.log(reply);
                                socket.end("exit\n");
                            } else if (reply.match(/[#]/)) {
                                reply = "";
                                socket.write(message + "\n");
                            }
                        });
                        socket.connect(6546, host);
                    })(fe.ipv4);
                }
            }
        };
    })();

    // ////////////////////////////////////////////////////////////////////////
    // what routes see
    // ////////////////////////////////////////////////////////////////////////

    return {

        init : mythMessageHandler.init,
        byRecGroup : byRecGroup,
        byFilename : byFilename,
        sortedTitles : sortedTitles,
        viewButtons : viewButtons,

        groupNames : groupNames,
        traitNames : traitNames,

        byVideoFolder : byVideoFolder,
        byVideoId : byVideoId,


        StreamRecording : function (fileName, encoding, callback) {
            var recording = byFilename[fileName];

            console.log('Stream Recording');
            console.log(encoding);

            reqJSON(
                {
                    path : "/Content/AddRecordingLiveStream?ChanId=" + recording.Channel.ChanId + "&StartTime=" + recording.Recording.StartTs + "&Width=" + encoding.Width + "&Bitrate=" + encoding.Bitrate
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        StreamVideo : function (videoId, encoding, callback) {
            var video = byVideoId[videoId];

            console.log('Stream Video');
            console.log("/Content/AddVideoLiveStream?Id=" + video.Id);
            console.log(encoding);

            reqJSON(
                {
                    path : "/Content/AddVideoLiveStream?Id=" + video.Id
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        StopStream : function (StreamId) {
            reqJSON(
                {
                    path : "/Content/StopLiveStream?Id=" + StreamId
                },
                function (reply) {
                    console.log(reply);
                }
            );
        },


        StreamList : function (callback) {
            reqJSON(
                {
                    path : "/Content/GetLiveStreamList"
                },
                function (reply) {
                    callback(reply);
                }
            );
        },

        FilteredStreamList : function (fileName, callback) {
            reqJSON(
                {
                    path : "/Content/GetFilteredLiveStreamList?FileName=" + fileName
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        GetLiveStream : function (streamId, callback) {
            reqJSON(
                {
                    path : "/Content/GetLiveStream?Id=" + streamId
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        RemoveLiveStream : function (streamId, callback) {
            reqJSON(
                {
                    path : "/Content/RemoveLiveStream?Id=" + streamId
                },
                function (reply) {
                    callback(reply);
                }
            );
        },


        DecodeVideoProps : function (recording) {
            return getVideoProps(recording.VideoProps);
        },


        MythServiceHost : function (request) {
            if (backend.customHost) {
                return backend.host + ":" + backend.port;
            } else {
                // use the client's path to us
                return request.headers.host.split(/:/)[0] + ":" + backend.port;
            }
        },

        GetFrontendList : function () {
            return Object.keys(frontends.byHost);
        },

        SendToFrontend : function (args) {
            var message;
            if (args.hasOwnProperty("FileName") && byFilename.hasOwnProperty(args.FileName)) {
                var prog = byFilename[args.FileName];
                message = "play program " + prog.Channel.ChanId + " " + localFromUTCString(prog.Recording.StartTs) + " resume";
            } else if (args.hasOwnProperty("VideoId") && byVideoId[args.VideoId]) {
                message = "play file myth://Videos/" + byVideoId[args.VideoId].FileName.toString("utf8").replace(/ /g, "%20");
            }
            if (message.length > 0) {
                frontendControl.SendMessage(args.Host, message);
            }
        }

    };

};