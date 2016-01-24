/*
 *  PlugfestLight.js
 *
 *  David Janes
 *  IOTDB
 *  2016-01-22
 */

"use strict";

var iotdb = require('iotdb');
var _ = iotdb._;

exports.binding = {
    bridge: require('../PlugfestBridge').Bridge,
    model: require('./PlugfestLight.json'),
    discover: false,
    connectd: {
        data_in: function (paramd) {
            if (paramd.rawd.brightness === undefined) {
                return;
            } else if (paramd.rawd.hue === undefined) {
                return;
            } else if (paramd.rawd.saturation === undefined) {
                return;
            }

            var color = new _.color.Color();
            color.set_hsb(
                paramd.rawd.hue,
                paramd.rawd.brightness * 100,
                paramd.rawd.saturation * 100
            );

            paramd.cookd.rgb = color.get_hex();
        },
        data_out: function (paramd) {
            if (paramd.cookd.rgb === undefined) {
                return;
            }

            var color = new _.color.Color(paramd.cookd.rgb);
            var hsb = color.get_hsb();

            paramd.rawd.hue = hsb.hue360;
            paramd.rawd.saturation = hsb.saturation100 / 100.0;
            paramd.rawd.brightness = hsb.brightness100 / 100.0;

            delete paramd.cookd.rgb;
        },
    },

};
