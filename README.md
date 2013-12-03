A simple jQuery plugin that adds [REST observer](https://www.dropbox.com/s/adinujoywzdm9nc/chapter.pdf) support for ajax requests.

# Installation

Include the script after jQuery library:

```html
<script src="path/to/jquery.rest-observer.js"></script>
```

# Usage

The plugin augments the built-in ajax interface with a new function ```observe```:

```javascript
$.ajax({
	method: 'GET',
	url: '/test'
}).observe().done(function () {
	console.log('success');
}).fail(function () {
	console.log('error');
});
```

If the ```/test``` response includes a link header that conveys a ```monitor``` relationship with an observer resource

```
Link: </observer>; rel="monitor"
```

the plugin will perform the following actions:

* connect to the ```/observer```resource
* each time an update notification is delivered will make a request to ```/test```to fetch the latest state of the resource. On success will execute the callback provided to _done_, while on error will execute the callback provided to _fail_.

When the method used for the ajax request is different than ```GET```, the user has the option to provide the done, fail and always callbacks as arguments of observe:

```javascript
$.ajax({
	method: '{POST|PUT}'
	...
}).observe(doneCallback, failCallback, alwaysCallback);
...
```

# License

The code is available under MIT license.
