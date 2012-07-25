(function (window,undefined) {
    "use strict";

    window.History = window.History || { };
    window.History.options = window.History.options || { };

    // default is once per second; too much for our purposes
    window.History.options.storeInterval = 5 * 60 * 1000;

})(window);
