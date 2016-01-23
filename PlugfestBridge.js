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
var bunyan = iotdb.bunyan;

var iotdb_links = require('iotdb-links');

var url = require('url');
var coap = require('coap');
coap.registerFormat('text/plain', 65201)
coap.registerFormat('text/plain', 65203)

var logger = bunyan.createLogger({
    name: 'homestar-plugfest',
    module: 'PlugfestBridge',
});

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
            url: null,
            verbose: true,
        }
    );
    self.native = native;   // the thing that does the work - keep this name

    if (self.native) {
        self.queue = _.queue("PlugfestBridge");

        if (self.initd.verbose) {
            logger.info({
                native: native,
            }, "new PlugfestBridge");
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
    coap_urlp.pathname = "/.well-known/core"
    var coap_url = url.format(coap_urlp);

    self._fetch(coap_url);
};


PlugfestBridge.prototype._fetch = function (start_url) {
    var self = this;

    var seend = {};
    var coap_urlp;

    var _handle_links = function(coap_url, string) {
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

    var _handle_embedded = function(coap_url, ed) {
        var base = _.d.get(ed, "/_base");
        if (!base) {
            coap_urlp = url.parse(coap_url);
            coap_urlp.pathname = "/"
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
        }
    };

    var _handle_json = function(coap_url, string) {
        var d = JSON.parse(string);
        var items = _.d.get(d, "_embedded/item", null);
        if (!items) {
            return;
        }

        var ind = null;
        var outd = null;
        items.map(function(item) {
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

        var native = ind;
        native.type = 'application/lighting+json';
        native.istate = {};
        if (outd) {
            native.config = outd.url;
        }

        self.discovered(new PlugfestBridge(self.initd, native));
    };

    var _download = function(coap_url) {
        if (seend[coap_url]) {
            logger.error({
                method: "_fetch/_download",
                url: coap_url,
                cause: "may not be a problem, just avoiding loops",
            }, "already downloaded");
            return;
        } 
        seend[coap_url] = true;

        self._download(coap_url, function(error, string) {
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
            } else {
            }
        });
    };

    _download(start_url);
}

PlugfestBridge.prototype._download = function(coap_url, callback) {
    var req = coap.request(coap_url);

    logger.info({
        method: "_download",
        url: coap_url,
    }, "download");


    req.on('response', function(res) {
        var parts = [];
        res.on('readable',function(){
            while (true) {
                var buffer = res.read();
                if (!buffer) {
                    return
                }

                parts.push(buffer.toString('utf-8'));
            }
        });


        res.on('end',function(){
            callback(null, parts.join("\n"));
        });
    });

    req.end()
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

    var _pulled = function() {
        var paramd = {
            rawd: self.native.state,
            cookd: _.shallowCopy(self.native.state),
        };

        if (self.connectd.data_in) {
            self.connectd.data_in(paramd);
        }

        self.pulled(paramd.cookd);
    };

    var _process = function(error, result) {
        if (error) {
            logger.error({
                method: "connect/_process",
                url: self.native.url,
                error: _.error.message(error),
            }, "network error");

            return;
        }

        var istate = JSON.parse(result);
        if (_.is.Equal(istate, self.native.state)) {
            return;
        }

        self.native.state = istate;
        _pulled();
    };

    /// https://github.com/mcollina/node-coap#requesturl
    var urlp = url.parse(self.native.url);

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
        coda: function() {
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
    var self;

    var paramd = {
        rawd: _.shallowCopy(pushd),
        cookd: pushd,
    };

    if (self.connectd.data_out) {
        self.connectd.data_out(paramd);
    }

    var state = _.d.compose.shallow(paramd.rawd, self.native.state);
    if (_.is.Equal(state, self.native.state)) {
        return;
    }

    self.native.state = state;

    self._notify();
    self.pulled(paramd.cookd);
};

PlugfestBridge.prototype._notify = function () {
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
        "iot:thing-id": _.id.thing_urn.network_unique("Plugfest", self.native.name),
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


/*
 *  API
 */
exports.Bridge = PlugfestBridge;
