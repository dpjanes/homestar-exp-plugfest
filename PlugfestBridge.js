/*
 *  PlugfestBridge.js
 *
 *  David Janes
 *  IOTDB.org
 *  2016-01-22
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
var _ = iotdb._;

var iotdb_links = require('iotdb-links');

var events = require('events');
var url = require('url');
var coap = require('coap');
coap.registerFormat('text/plain', 65201);
coap.registerFormat('text/plain', 65202);
coap.registerFormat('text/plain', 65203);
coap.registerFormat('text/plain', 65204);

var logger = iotdb.logger({
    name: 'homestar-plugfest',
    module: 'PlugfestBridge',
});

var _plug_index = 0;

/**
 *  See {iotdb.bridge.Bridge#Bridge} for documentation.
 *  <p>
 *  @param {object|undefined} native
 *  only used for instances, should be 
 */
var PlugfestBridge = function (initd, native) {
    var self = this;

    self.initd = _.defaults(initd,
        iotdb.keystore().get("bridges/PlugfestBridge/initd"), {
            poll: 30,
            server_host: null,
            server_port: 22000,
            url: null,
            verbose: true,
        }
    );
    self.native = native;

    if (self.native) {
        _plug_index++;

        self.queue = _.queue("PlugfestBridge");
        self.stated = {};

        self._emitter = new events.EventEmitter();

        if (self.initd.verbose) {
            logger.info({
                native: native,
            }, "new PlugfestBridge");
        }

        if (self.initd.config) {
            self._server(function (error, server) {
                if (error) {
                    logger.error({
                        method: "PlugfestBridge",
                        error: _.error.message(error),
                    }, "could not create a CoAP server");
                    return;
                }

                var update_path = "/ostate/" + _plug_index;
                var update_url = server._iotdb_url + update_path;

                logger.info({
                    method: "PlugfestBridge",
                    update_path: update_path,
                    update_url: update_url,
                }, "listening for CoAP requests");

                server.on('request', function (req, res) {
                    if (req.url !== update_path) {
                        return;
                    }

                    res.write(JSON.stringify(self.stated));
                    res.write("\n");

                    if (req.headers['Observe'] !== 0) {
                        res.end();
                        return;
                    }

                    self._emitter.on("push", function () {
                        if (!res) {
                            return;
                        }

                        res.write(JSON.stringify(self.stated));
                        res.write("\n");
                    });
                    self._emitter.on("end", function () {
                        res.end();
                        res = null;
                    });
                });

                // now tell the other side to listen for messages
                var msg = {
                    "_base": null,
                    "_embedded": null,
                    "_forms": {
                        "update": {
                            "accept": "application/lighting-config+json",
                            "href": "",
                            "method": "PUT"
                        }
                    },
                    "_links": null,
                    "src": {
                        "href": "coap://129.132.130.252:63552/state",
                        "type": null,
                        "x": 1
                    }
                };
                _.d.set(msg, "/src/href", update_url);

                var curlp = url.parse(self.initd.config);

                var oreq = coap.request({
                    hostname: curlp.hostname,
                    pathname: curlp.pathname,
                    port: curlp.port,
                    method: 'PUT',
                });
                oreq.write(JSON.stringify(msg));
                oreq.end();

                // process.exit()

            });
        }
    }

};

PlugfestBridge.prototype = new iotdb.Bridge();

PlugfestBridge.prototype.name = function () {
    return "PlugfestBridge";
};

/* --- lifecycle --- */

/**
 *  See {iotdb.bridge.Bridge#discover} for documentation.
 */
PlugfestBridge.prototype.discover = function () {
    var self = this;

    logger.info({
        method: "discover"
    }, "called");

    if (!self.initd.url) {
        throw new Error("'url' is required parameter");
    }

    // fetch from the beginning
    var coap_urlp = url.parse(self.initd.url);
    coap_urlp.pathname = "/.well-known/core";
    var coap_url = url.format(coap_urlp);

    self._fetch(coap_url);
};


PlugfestBridge.prototype._fetch = function (start_url) {
    var self = this;

    var seend = {};
    var coap_urlp;

    var _download;
    var _handle_links = function (coap_url, string) {
        var d = iotdb_links.parse(string);
        for (var resource_url in d) {
            var resourced = d[resource_url];
            if (resourced.ct !== '65201') {
                continue;
            }

            if (resource_url.match(/^[\/]/)) {
                coap_urlp = url.parse(coap_url);
                coap_urlp.pathname = resource_url;

                resource_url = url.format(coap_urlp);
            }

            _download(resource_url);
        }
    };

    var _handle_embedded = function (coap_url, ed) {
        var base = _.d.get(ed, "/_base");
        if (!base) {
            coap_urlp = url.parse(coap_url);
            coap_urlp.pathname = "/";
            base = url.format(coap_urlp);
        }

        var href = _.d.get(ed, "/_links/about/href");
        if (!href) {
            href = _.d.get(ed, "/_links/config/href");
        }
        if (!href) {
            return;
        }

        coap_urlp = url.parse(base);
        coap_urlp.pathname = href;

        return {
            "name": _.d.get(ed, "name", null),
            "purpose": _.d.get(ed, "purpose", null),
            "url": url.format(coap_urlp),
        };
    };

    var _handle_json = function (coap_url, string) {
        var d = JSON.parse(string);
        var items = _.d.get(d, "_embedded/item", null);
        if (!items) {
            return;
        }

        var ind = null;
        var outd = null;
        items.map(function (item) {
            if (_.d.get(item, "/_links/about/type") === 'application/lighting+json') {
                ind = _handle_embedded(coap_url, item);
            }
            if (_.d.get(item, "/_links/config/type") === 'application/lighting-config+json') {
                outd = _handle_embedded(coap_url, item);
            }
        });

        if (!ind) {
            return;
        }

        var initd = _.d.compose.shallow({
            type: 'application/lighting+json',
        }, ind, self.initd);

        if (outd) {
            initd.config = outd.url;
        }

        self.discovered(new PlugfestBridge(initd, {}));
    };

    _download = function (coap_url) {
        if (seend[coap_url]) {
            logger.error({
                method: "_fetch/_download",
                url: coap_url,
                cause: "may not be a problem, just avoiding loops",
            }, "already downloaded");
            return;
        }
        seend[coap_url] = true;

        self._download(coap_url, function (error, string) {
            if (error) {
                logger.error({
                    method: "_fetch/_download",
                    url: coap_url,
                    error: _.error.message(error),
                }, "error downloading");
                return;
            }

            if (string.match(/^</)) {
                _handle_links(coap_url, string);
            } else if (string.match(/^{/)) {
                _handle_json(coap_url, string);
            } else {}
        });
    };

    _download(start_url);
};

PlugfestBridge.prototype._download = function (coap_url, callback) {
    var req = coap.request(coap_url);

    logger.info({
        method: "_download",
        url: coap_url,
    }, "download");


    req.on('response', function (res) {
        var parts = [];
        res.on('readable', function () {
            while (true) {
                var buffer = res.read();
                if (!buffer) {
                    return;
                }

                parts.push(buffer.toString('utf-8'));
            }
        });

        res.on('end', function () {
            callback(null, parts.join("\n"));
        });
    });

    req.end();
};

/**
 *  See {iotdb.bridge.Bridge#connect} for documentation.
 */
PlugfestBridge.prototype.connect = function (connectd) {
    var self = this;
    if (!self.native) {
        return;
    }

    self.connectd = _.defaults(connectd, {}, self.connectd);

    var _process = function (error, result) {
        if (error) {
            logger.error({
                method: "connect/_process",
                url: self.native.url,
                error: _.error.message(error),
            }, "network error");

            return;
        }

        var istate = JSON.parse(result);
        if (_.is.Equal(istate, self.stated)) {
            return;
        }

        self.stated = istate;
        self._pulled();
    };

    /// https://github.com/mcollina/node-coap#requesturl
    var urlp = url.parse(self.initd.url);

    self._download({
        hostname: urlp.hostname,
        pathname: urlp.pathname,
        port: urlp.port,
        observe: true,
    }, _process);

    self._download({
        hostname: urlp.hostname,
        pathname: urlp.pathname,
        port: urlp.port,
    }, _process);
};

PlugfestBridge.prototype._forget = function () {
    var self = this;
    if (!self.native) {
        return;
    }

    logger.info({
        method: "_forget"
    }, "called");

    self.native = null;
    self.pulled();
};

/**
 *  See {iotdb.bridge.Bridge#disconnect} for documentation.
 */
PlugfestBridge.prototype.disconnect = function () {
    var self = this;
    if (!self.native || !self.native) {
        return;
    }

    self._forget();
};

/* --- data --- */

/**
 *  See {iotdb.bridge.Bridge#push} for documentation.
 */
PlugfestBridge.prototype.push = function (pushd, done) {
    var self = this;
    if (!self.native) {
        done(new Error("not connected"));
        return;
    }

    self._validate_push(pushd);

    logger.info({
        method: "push",
        pushd: pushd
    }, "push");

    var qitem = {
        run: function () {
            self._push(pushd);
            self.queue.finished(qitem);
        },
        coda: function () {
            done();
        },
    };
    self.queue.add(qitem);
};

/**
 *  Do the work of pushing. If you don't need queueing
 *  consider just moving this up into push
 */
PlugfestBridge.prototype._push = function (pushd) {
    var self = this;

    var paramd = {
        rawd: _.d.clone.shallow(pushd),
        cookd: pushd,
    };

    if (self.connectd.data_out) {
        self.connectd.data_out(paramd);
    }

    var state = _.d.compose.shallow(paramd.rawd, self.stated);
    if (_.is.Equal(state, self.stated)) {
        return;
    }

    self.stated = state;

    self._emitter.emit("push");
    self._pulled();
};

PlugfestBridge.prototype._pulled = function () {
    var self = this;

    var paramd = {
        rawd: self.stated,
        cookd: _.d.clone.shallow(self.stated),
    };

    if (self.connectd.data_in) {
        self.connectd.data_in(paramd);
    }

    self.pulled(paramd.cookd);
};

/**
 *  See {iotdb.bridge.Bridge#pull} for documentation.
 */
PlugfestBridge.prototype.pull = function () {
    var self = this;
    if (!self.native) {
        return;
    }
};

/* --- state --- */

/**
 *  See {iotdb.bridge.Bridge#meta} for documentation.
 */
PlugfestBridge.prototype.meta = function () {
    var self = this;
    if (!self.native) {
        return;
    }

    return {
        "iot:thing-id": _.id.thing_urn.network_unique("Plugfest", _.hash.md5(self.initd.name)),
        "schema:name": self.native.name || "Plugfest",
        "iot:vendor.content-type": 'application/lighting+json',
    };
};

/**
 *  See {iotdb.bridge.Bridge#reachable} for documentation.
 */
PlugfestBridge.prototype.reachable = function () {
    return this.native !== null;
};

/**
 *  See {iotdb.bridge.Bridge#configure} for documentation.
 */
PlugfestBridge.prototype.configure = function (app) {};

/* --- internals ---*/

var _server = null;
var _pendings = [];

PlugfestBridge.prototype._server = function (callback) {
    var self = this;

    if (_server) {
        return callback(null, _server);
    }

    _pendings.push(callback);

    var _done = function (error, server) {
        if (error) {
            _server = null;
        } else {
            _server = server;
        }

        _pendings.map(function (pending) {
            pending(error, _server);
        });
    };

    _.net.external.ipv4(function (error, ipv4) {
        if (self.initd.server_host) {
            ipv4 = self.initd.server_host;
        } else if (error) {
            ipv4 = _.net.ipv4();
        }

        var server = coap.createServer();
        server.listen(self.initd.server_port, "0.0.0.0", function (error) {
            if (server) {
                server._iotdb_url = "coap://" + ipv4 + ":" + self.initd.server_port;
            }

            _done(error, server);
        });
    });

};

/*
 *  API
 */
exports.Bridge = PlugfestBridge;
