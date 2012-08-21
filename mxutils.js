
exports.filterIPv4 = function (addressList) {
    var ip4 = [ ];
    addressList.forEach(function (address) {
        if (address.match(/^[.0-9]+$/))
            ip4.push(address);
    });
    return ip4;
};

exports.hostFromService = function (service) {
    var parts = service.name.split(/[ ]/);
    return parts[parts.length - 1];
};

// similar to jQuery extend
exports.copyProperties = function (src, dst) {
    Object.keys(src).forEach(function (property) {
        if (src.hasOwnProperty(property)) { // don't copy properties from parent objects
            if (typeof(src[property]) === "object" && !src[property].hasOwnProperty("length")) {
                // property is an object but not an array
                if (!dst.hasOwnProperty(property))
                    dst[property] = { };
                exports.copyProperties(src[property], dst[property]);
            } else {
                dst[property] = src[property];
            }
        }
    });
    return dst;
};
