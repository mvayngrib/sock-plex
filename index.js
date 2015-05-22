
var dgram = require('dgram')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var createSocket = dgram.createSocket // raw, use newSocket instead
var SOCKET_EVENTS = ['message', 'listening', 'error', 'close']
var PROXY_EVENTS = ['listening', 'error']
var ID = 0
var SOCKETS = {
  udp4: {},
  udp6: {}
}

if (!dgram.__sockjacked) hijack()

function hijack() {
  dgram.__sockjacked = true
  var createSocket = dgram.createSocket

  dgram.createSocket = function(options) {
    return new Socket(options)
  }
}

function newSocket(options) {
  var socket = createSocket(options)
  bindEvents(socket)
  return socket
}

function Socket(options) {
  EventEmitter.call(this)
  this._jackid = ID++
  this._type = typeof options === 'string' ? options : options.type
  this.setMaxListeners(0)
  this._msgFilters = []
}

util.inherits(Socket, EventEmitter)

Socket.prototype.bind = function(port, host, cb) {
  var self = this

  if (this._binding) throw new Error('already binding')

  this._binding = true

  var socket
  var typePorts = SOCKETS[this._type]
  if (typeof port === 'function') {
    cb = port
    port = null
    host = null
  }
  else if (typeof host === 'function') {
    cb = host
    host = null
  }

  if (!port) {
    socket = newSocket(this._type)
    socket.once('listening', onPortKnown)
    socket.bind()
  }
  else {
    var cached = typePorts[port]
    if (cached) {
      socket = cached.socket
    }
    else {
      socket = newSocket(this._type)
      socket.bind(port, host)
    }

    onPortKnown(port)
  }

  socket.setMaxListeners(0)
  this.socket = socket
  this._handle = socket._handle

  socket.once('close', function() {
    delete typePorts[self._port]
  })

  if (cb) this.once('listening', cb)

  function onPortKnown(port) {
    if (typeof port === 'undefined') port = socket.address().port

    self._port = port
    if (!typePorts[port]) {
      typePorts[port] = {
        socket: socket,
        wrappers: []
      }
    }

    if (typePorts[port].wrappers.indexOf(self) !== -1) debugger
    typePorts[port].wrappers.push(self)
    process.nextTick(self.emit.bind(self, 'listening'))
  }
}

Socket.prototype.close =  function() {
  var self = this

  this._closing = true

  var cached = SOCKETS[this._type][this._port]
  if (cached) {
    cached.wrappers.splice(cached.wrappers.indexOf(this), 1)
    if (!cached.wrappers.length) cached.socket.close()
  }
  else this.socket.close()

  process.nextTick(function() {
    delete self.socket
    self.emit('close')
  })
}

Socket.prototype.send = function() {
  var self = this
  var args = arguments
  if (!this._port) {
    this.bind()
    this.once('listening', function() {
      self.socket.send.apply(self.socket, args)
    })
  }
  else {
    this.socket.send.apply(this.socket, args)
  }
}

Socket.prototype._maybeEmit = function(event /*,... args */) {
  if (event === 'message') {
    if (this._closing || !this._filterMessages(arguments[1], arguments[2])) return
  }

  return this.emit.apply(this, arguments)
}

Socket.prototype.filterMessages = function(filter) {
  this._msgFilters.push(filter)
}

Socket.prototype._filterMessages = function(msg, rinfo) {
  return !this._msgFilters.length || this._msgFilters.some(function(filter) {
    return filter(msg, rinfo)
  })
}

;['address'].forEach(function(method) {
  Socket.prototype[method] = function() {
    return this.socket[method].apply(this.socket, arguments)
  }
})

function bindEvents(socket) {
  ['message', 'error'].forEach(function(event) {
    var method = event === 'close' ? 'once' : 'on'
    socket[method](event, function() {
      var cached = SOCKETS[socket.type][socket.address().port]
      if (!cached) throw new Error('missing socket wrapper')

      var args = [].slice.call(arguments)
      args.unshift(event)
      cached.wrappers.forEach(function(wrapper) {
        wrapper._maybeEmit.apply(wrapper, args)
      })
    })
  })
}

function newListenersCache() {
  var cache = Object.create(null)

  SOCKET_EVENTS.forEach(function(e) {
    cache[e] = []
  })

  return cache
}

// setInterval(function() {
//   for (var type in SOCKETS) {
//     var byType = SOCKETS[type]
//     for (var port in byType) {
//       var cache = byType[port]
//       console.log(cache.wrappers.length, 'wrappers left for', port, cache.wrappers.map(function(w) {
//         return w._jackid
//       }).join(', '))
//     }
//   }
// }, 2000)