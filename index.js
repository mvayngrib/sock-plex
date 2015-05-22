
var dgram = require('dgram')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var createSocket = dgram.createSocket
var SOCKET_EVENTS = ['message', 'listening', 'error']
var ports = {
  udp4: {},
  udp6: {}
}

var createSocket = dgram.createSocket
dgram.createSocket = function(options) {
  return new Socket(options)
}

function Socket(options) {
  EventEmitter.call(this)
  this._type = typeof options === 'string' ? options : options.type
  this._slisteners = []
  this.setMaxListeners(0)
}

util.inherits(Socket, EventEmitter)

Socket.prototype.bind = function(port, host, cb) {
  var self = this
  var socket
  var typePorts = ports[this._type]
  if (typeof host === 'function') {
    cb = host
    host = null
  }

  if (!port) {
    socket = createSocket(this._type)
    socket.once('listening', onPortKnown)
    socket.bind()
  }
  else {
    var cached = typePorts[port]
    if (cached) {
      socket = cached.socket
      process.nextTick(this.emit.bind(this, 'listening'))
    }
    else {
      socket = createSocket(this._type)
      socket.bind(port, host)
    }

    onPortKnown(port)
  }

  socket.setMaxListeners(0)
  this.socket = socket
  this._handle = socket._handle

  SOCKET_EVENTS.forEach(function(e) {
    self.socket.on(e, listener)
    self._slisteners.push([e, listener])

    function listener() {
      var args = [].slice.call(arguments)
      args.unshift(e)
      self.emit.apply(self, args)
    }
  })

  socket.once('close', function() {
    delete typePorts[self._port]
  })

  if (cb) this.once('listening', cb)

  function onPortKnown(port) {
    if (typeof port === 'undefined') port = socket.address().port

    self._port = port
    typePorts[port] = typePorts[port] || {
      socket: socket,
      wrappers: []
    }

    typePorts[port].wrappers.push(self)
  }
}

Socket.prototype.close =  function() {
  var self = this

  var cached = ports[this._type][this._port]
  if (cached) {
    cached.wrappers.splice(cached.wrappers.indexOf(this), 1)
    if (!cached.wrappers.length) cached.socket.close()
  }
  else this.socket.close()

  process.nextTick(function() {
    delete self.socket
    self.emit('close')
  })

  this._slisteners.forEach(function(pair) {
    self.socket.removeListener(pair[0], pair[1])
  })

  this._slisteners.length = 0
}

Socket.prototype.send = function() {
  var self = this
  if (!this._port) {
    this.bind()
    var args = arguments
    this.once('listening', function() {
      self.socket.send.apply(self.socket, args)
    })
  }
  else this.socket.send.apply(this.socket, arguments)
}

;['address'].forEach(function(method) {
  Socket.prototype[method] = function() {
    return this.socket[method].apply(this.socket, arguments)
  }
})