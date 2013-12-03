/*
    The MIT License (MIT)
    Copyright (c) 2013 Vlad Stirbu
    
    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:
    
    The above copyright notice and this permission notice shall be
    included in all copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
    LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
    OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
    WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function ( $ ) {
	'use strict';
	
	/**
	 * Global observers and requests cache.
	 */
	var _observers = {},
			_requests = {},
			
			notification = {
				UPDATE: 0,
				DELETE: 1
			};
	
	$.ajaxPrefilter(function(options, originals, xhr) {
		
		/**
		 * Adds the current request to the cached requests. Stores the 
		 * original settings provided in the ajax request as well as the
		 * callbacks.res.statusCode >= 200 && res.statusCode < 300
		 */
		function rememberRequest() {
			if (!_requests[originals.url]) {
				_requests[originals.url] = {
					originals: originals,
					done: [],
					fail: [],
					always: []
				};
			}
		}
		
		/**		 
		 * Removes the current request from the cached requests.
		 */
		function forgetRequest() {
			if (_requests[originals.url]) {
				delete _requests[originals.url];
			}
		}
		
		/**
		 * Add the url indicated by the 'monitor' relationship to the cached
		 * observers, and setup the ajax request to the respective observer
		 * including the handling of the notifications.
		 *
		 * @param {type} url
		 */
		function rememberObserver(url) {
			var obsXhr,
					boundary_string,
					old_pos = 0;
			
			/**
			 * Processes a notification message received from the observer:
			 * 
			 * Inline update:
			 * 
			 * --boundary-string
			 * HTTP/1.1 204 No Content
			 * Content-Type: message/external-body; access-type=http
			 * Content-ID: {observedResourceURI}
			 * Last-Modified: Mon, 2 Dec 2013 19:00:00 GMT
			 *
			 * Delete updates:
			 *
			 * --boundary-string
			 * HTTP/1.1 410 Gone
			 * Content-Location: {observedResourceURI}
			 * Last-Modified: Mon, 2 Dec 2013 19:00:00 GMT
			 *
			 * @param {string} msg Notification message
			 */
			function processMessage(msg) {
				var result = {},
						request,
						hasBody = false,
						httpMessage = false;
				
				console.log('notification result', result);
				msg.split('\n').forEach(function (line, index) {
					var frags;
					
					if (index && httpMessage) {
						frags = line.split(': ');
						switch (frags[0]) {
						case 'Content-Type':
							if (frags[1].indexOf('message/external-body') === 0) {
								console.log('external notification');
							} else {
								console.log('inline notification');
								hasBody = true;
							}
							break;
						case 'Content-Location':
						case 'Content-ID':
							result.location = frags[1];
							break;
						case 'Last-Modified':
							result.lastModified = frags[1];
							break;
						default:
						}
					} else {
						if (line.indexOf('HTTP') === 0) {
							frags = line.split(' ');
							
							console.log('HTTP message');
							httpMessage = true;
							
							if (frags[1]) {
								switch (frags[1]) {
								case '200':
								case '204':
									console.log('update notification');
									result.type = notification.UPDATE;
									break;
								case '410':
									console.log('delete notification');
									result.type = notification.DELETE;
									break;
								default:
								}
							}
						}
					}
				});

				request = _requests[result.location];
				switch (result.type) {
				case notification.DELETE:
					console.log('execute the fail callback for the request and remove from cache');
						
					request.fail.forEach(function (callback) {
						callback(xhr, 'error', 'Gone');
					});
					
					delete _requests[result.location];
						
					break;
				case notification.UPDATE:
					$.ajax(request.originals)
						.done(request.done)
						.fail(request.fail)
						.always(request.always);
					break;
				default:
				}
			}
			
			/**
			 * Processes the chunks delivered by the observer, spliting them in messages
			 * according to the boundary strings.
			 * @param {event} event Description
			 */
			function onprogress(event) {
				var chunk = event.target.responseText.substring(old_pos, event.position);
				old_pos = event.position;
				
				chunk.split(boundary_string).forEach(function (value) {
					if (!value.match(/^\n$|^$/g)) {
						processMessage(value);
					} else {
						console.dir(value);
					}
				});
				
			}
			
			if (!_observers[url]) {
				console.log('add observer resource:', url);
				
				obsXhr = $.ajax({
					method: 'GET',
					url: url,
					xhrFields: {
						onreadystatechange: function (event) {
							var contentType = event.target.getResponseHeader('Content-Type');
							
							if (event.target.readyState === 3 && contentType.indexOf('multipart/mixed') !== -1) {
								boundary_string = '--' + contentType.match(/boundary="(.+?)"/)[1] + '\n';
								if (!this.onprogress) {
									this.onprogress = onprogress;
								}
							}
						}
					}
				});
				
				_observers[url] = {};
				console.log('observers:', _observers);
			} else {
				console.log('observer already known');
			}
		}
		
		/**
		 * The done callback that detects if a resource indicates REST observer support.
		 * @param {type} data Description
		 * @param {string} status Description
		 * @param {object} xhr Description
		 */
		function observerDoneCallback(data, status, xhr) {
			var links,
					observer;
			
			links = xhr.getResponseHeader('Link');
			
			if (links) {
				links.split(',').forEach(function (value) {
					if (value.match(/rel="^|\b(?:monitor){1}\b|$"/)) {
						console.log('resource can be monitored');
						
						observer = value.match(/<(.+?)>/)[1];
						rememberObserver(observer);
					} else {
						console.log('resource can not be monitored');
						forgetRequest();
					}
					console.log(observer);
				});
			}
		}
		
		/**
		 * Signals the intent of monitoring the resource for notifications.
		 *
		 * @param {function} done Callback to be executed on success.
		 * @param {function} fail Callback to be executed on error.
		 * @param {function} always Callback to be executed when request is completed.
		 */
		function observe(done, fail, always) {
			var original_done,
					original_fail,
					original_always;
			
			console.log('enable observer');
			rememberRequest();
			xhr.pipe(observerDoneCallback);
			
			if (originals.method === 'GET') {
				// installing done spy
				original_done = xhr.done;
				xhr.done = function (callback) {
					console.log('done spy installed', arguments);
					original_done(callback);
					
					_requests[originals.url].done.push(callback);
					return xhr;
				};
				
				// installing fail spy
				original_fail = xhr.fail;
				xhr.fail = function (callback) {
					console.log('fail spy installed', arguments);
					original_fail(callback);
					
					_requests[originals.url].fail.push(callback);
					return xhr;
				};
				
				// installing always spy
				original_always = xhr.always;
				xhr.always = function (callback) {
					console.log('always spy installed', arguments);
					original_always(callback);
					
					_requests[originals.url].always.push(callback);
					return xhr;
				};
			} else {
				
				if (done) {
					_requests[originals.url].done.push(done);
				}
				
				if (fail) {
					_requests[originals.url].fail.push(fail);
				}
				
				if (always) {
					_requests[originals.url].always.push(always);
				}
				
			}
			
			console.log('requests', _requests);
			
			return xhr;
		};
		
		xhr.observe = observe;
		
	});
	
})( jQuery );