/*
 *  PlugfestLight.js
 *
 *  David Janes
 *  IOTDB
 *  2016-01-22
 */

exports.binding = {
    bridge: require('../PlugfestBridge').Bridge,
    model: require('./PlugfestLight.json'),
    connectd: {
        data_in: function (paramd) {
            console.log("HERE:!!!!!!!!");
        },
    },

};
