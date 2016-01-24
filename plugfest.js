/*
 *  plugfest.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-23
 *
 *  Copyright [2013-2016] [David P. Janes]
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

"use strict";

var iotdb = require('iotdb');
var iotdb_transport = require('iotdb-transport');
var _ = iotdb.helpers;

// this should be optional
var PlugfestTransport = require('iotdb-exp-transport-plugfest').Transport;

var _transport_express = function (app, iotdb_transporter) {
    var owner = iotdb.users.owner();
    var express_transporter = new PlugfestTransport({
        prefix: url_join("/", "api", "things"),
        key_things: "thing",
    }, app);
    iotdb_transport.bind(iotdb_transporter, express_transporter, {
        bands: [ "istate", "ostate", "model", ],
        updated: [ "ostate", ],
        user: owner,
    });
};

var on_ready = function(locals, profile) {
};

/**
 *  API
 */
exports.on_ready = on_ready;

