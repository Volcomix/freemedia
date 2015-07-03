/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/express/express.d.ts"/>
/// <reference path="../typings/request/request.d.ts"/>
/// <reference path="../typings/q/Q.d.ts"/>

import url = require('url');

import express = require('express');
import request = require('request');
import Q = require('q');

import CA = require('./CertificateAuthority');
import MitmServer = require('./MitmServer');
import ProxyServer = require('./ProxyServer');

class MitmProxy {

	public mitmServer: MitmServer;
	public proxyServer: ProxyServer;

	constructor(app?: express.Express, ca?: CA,
		private verbose?: boolean, proxyVerbose?: boolean, mitmVerbose?: boolean) {

		var externalApp = !!app;

		if (!externalApp) {
			app = express();
		}

		app.use((req: express.Request, res: express.Response, next: Function) => {
			if (req.secure) {
				req.url = url.resolve(req.protocol + '://' + req.header('host'), req.url);
			}
			next();
		});

		if (!externalApp) {
			app.use(this.proxy);
		}

		this.mitmServer = new MitmServer(app, ca, mitmVerbose);
		this.proxyServer = new ProxyServer(app, this.mitmServer, proxyVerbose)
	}

	proxy = (req: express.Request, res: express.Response, next: Function) => {
		if (this.verbose) {
			console.log(req.url);
		}
		req.pipe(request(req.url, { followRedirect: false }, () => {
			next();
		})).pipe(res);
	};

	listen(proxyPort = 3128, mitmPort = 3129, listeningListener?: () => void): MitmProxy {
		Q.all([
			Q.Promise((resolve) => {
				this.mitmServer.listen(mitmPort, () => {
					var host = this.mitmServer.address.address;
					var port = this.mitmServer.address.port;

					if (this.verbose) {
						console.log('MITM server listening at https://%s:%s', host, port);
					}

					resolve({});
				});
			}),
			Q.Promise((resolve) => {
				this.proxyServer.listen(proxyPort, () => {
					var host = this.proxyServer.address.address;
					var port = this.proxyServer.address.port;

					if (this.verbose) {
						console.log('Proxy listening at http://%s:%s', host, port);
					}

					resolve({});
				});
			})
		]).done(() => {
			if (listeningListener) {
				listeningListener();
			}
		});

		return this;
	}

	close(listeningListener?: () => void) {
		Q.all([
			Q.Promise((resolve) => {
				this.proxyServer.close().on('close', resolve);
			}),
			Q.Promise((resolve) => {
				this.mitmServer.close().on('close', resolve);
			})
		]).done(() => {
			if (listeningListener) {
				listeningListener();
			}
		});
	}
}

export = MitmProxy;