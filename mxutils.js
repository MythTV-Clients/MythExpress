
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
