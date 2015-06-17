# sock-share

_This module is used by [Tradle](https://github.com/tradle/about/wiki)_

Multiplexing dgram sockets

## Usage

### Basic

```js
require('sock-share') // hacks dgram

var dgram = require('dgram')

var a = dgram.createSocket('udp4')
var b = dgram.createSocket('udp4')
var c = dgram.createSocket('udp4')

a.bind(12345)
b.bind(12345)
c.bind(54321)

a.on('message', logger('a'))
b.on('message', logger('b'))
c.send(new Buffer('hey'), 0, 3, 12345, '127.0.0.1')

// -> a hey
// -> b hey
// with regular dgram.Socket, either a or b would get the message, but not both

function logger (name) {
  return function (msg) {
    console.log(name, msg.toString())
  }
}
```

### Filtering

```js
var a = dgram.createSocket('udp4')
a.filterMessages(function (msg, rinfo) {
  return /^d1:.?d2:id20:/.test(msg) // only accept bittorrent-dht messages
})

a.on('message', function (msg, rinfo) {
  // msg is a bittorrent-dht message
})
```

### TODO

- option to wrap dgram instead of hacking it
