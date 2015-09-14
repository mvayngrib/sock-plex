
var fs = require('fs')
var path = require('path')
var test = require('tape')
// var bufferEqual = require('buffer-equal')
var dgram = require('dgram')
require('../')

// fs.readdirSync('./test/simple').forEach(function(f, i) {
//   if (!/index\.js$/.test(f)) {
//     require('./simple/' + f)
//   }
// })

// [
// test-dgram-address.js
// test-dgram-bind-default-address.js
// test-dgram-bind-shared-ports.js
// test-dgram-bind.js
// test-dgram-broadcast-multi-process.js
// test-dgram-bytes-length.js
// test-dgram-close.js
// test-dgram-empty-packet.js
// test-dgram-exclusive-implicit-bind.js
// test-dgram-implicit-bind.js
// test-dgram-listen-after-bind.js
// test-dgram-msgsize.js
// test-dgram-multicast-setTTL.js
// test-dgram-oob-buffer.js
// test-dgram-pingpong.js
// test-dgram-ref.js
// test-dgram-regress-4496.js
// test-dgram-send-bad-arguments.js
// test-dgram-send-callback-buffer-length.js
// test-dgram-send-empty-buffer.js
// test-dgram-udp4.js
// test-dgram-unref.js
// ]

test('port sharing listening', function(t) {
  var num = 5
  t.plan(num)

  var sockets = []
  var port = 12345
  for (var i = 0; i < num; i++) {
    var s = dgram.createSocket('udp4')
    s.bind(port)
    s.once('listening', done)
    sockets.push(s)
  }

  function done() {
    t.pass()
    if (--num === 0) {
      sockets.forEach(function(s) {
        s.close()
      })
    }
  }
})

test('port sharing on sending and receiving sides', function(t) {
  var numFrom = 10
  var numTo = 10
  var msgs = ['be excellent to each other', 'party on dudes!'].map(function(m) {
    return new Buffer(m)
  })

  t.plan(numTo * msgs.length)
  t.timeoutAfter(1000)

  var fromPort = 8999
  var toPort = 9000
  var fromSockets = nullArray(numFrom).map(function() {
    var s = dgram.createSocket('udp4')
    s.bind(fromPort)
    return s
  })

  var listening = 0
  var toSockets = nullArray(numTo).map(function() {
    var s = dgram.createSocket('udp4')
    var recv = []
    s.bind(toPort)
    s.on('listening', onlistening)
    s.on('message', function(m) {
      t.deepEqual(m, msgs[recv.length])
      recv.push(m)
      next()
    })

    return s
  })

  function onlistening() {
    if (++listening === numTo) next()
  }

  var sIdx = 0
  var fromSocket
  var sent = 0

  function next() {
    fromSocket = fromSockets[sIdx]
    if (fromSocket) {
      var msg = msgs[sent]
      fromSocket.send(msg, 0, msg.length, toPort, '127.0.0.1')
    }
    else {
      fromSockets.forEach(function(s) {
        s.close()
      })

      toSockets.forEach(function(s) {
        s.close()
      })
    }

    if (++sent === msgs.length) {
      sIdx++
      sent = 0
    }
  }
})

test('filter messages', function(t) {
  t.plan(2)

  var msgs = ['hey', 'ho'].map(function(m) { return new Buffer(m) })
  var a = dgram.createSocket('udp4')
  a.bind(onlistening)
  var b = dgram.createSocket('udp4')
  b.bind(onlistening)
  b.filterMessages(function(msg) {
    return msg.toString() === 'ho'
  })

  b.on('message', function(msg) {
    t.equal(msg.toString(), 'ho')
    setTimeout(function() {
      a.close()
      b.close()
      t.pass()
    }, 200)
  })

  var togo = 2
  function onlistening() {
    if (--togo === 0) send()
  }

  function send() {
    msgs.forEach(function(m) {
      a.send(m, 0, m.length, b.address().port, b.address().address)
    })
  }
})

function nullArray(n) {
  var arr = []
  for (var i = 0; i < n; i++) {
    arr.push(null)
  }

  return arr
}
