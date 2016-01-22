/*
 *  Plugfest.js
 *
 *  David Janes
 *  IOTDB
 *  2016-01-22
 */

var iotdb = require("iotdb");

exports.binding = {
    bridge: require('../PlugfestBridge').Bridge,
    model: require('./Plugfest.json'),
};
