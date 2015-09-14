
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

var UNDEF = []

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
  UNDEF.push(this)
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

  var cached
  if (!port) {
    socket = newSocket(this._type)
    socket.bind()
  }
  else {
    cached = typePorts[port]
    if (cached) {
      socket = cached.socket
    }
    else {
      socket = newSocket(this._type)
      socket.bind(port, host)
    }

    onPortKnowable()
  }

  if (cached) {
    if (cached.listening) {
      process.nextTick(function() {
        if (!self._closing) self.emit('listening')
      })
    }
  }
  else {
    socket.once('listening', onListening)
  }

  socket.setMaxListeners(0)
  this.socket = socket
  this._handle = socket._handle

  socket.once('close', function() {
    delete typePorts[self._port]
  })

  if (cb) this.once('listening', cb)

  function onPortKnowable() {
    if (!port) port = socket.address().port

    self._port = port
    var cached = getCache()

    var idx = UNDEF.indexOf(self)
    if (idx !== -1) UNDEF.splice(idx, 1)

    typePorts[port].wrappers.push(self)
  }

  function onListening() {
    if (!port) onPortKnowable()

    var cached = getCache()
    cached.listening = true
    process.nextTick(function() {
      cached.wrappers.forEach(function(w) {
        if (!w._closing) w.emit('listening')
      })
    })
  }

  function getCache () {
    return typePorts[port] = typePorts[port] || newWrapper(socket)
  }
}

Socket.prototype.close =  function() {
  var self = this

  this._closing = true

  var cached = SOCKETS[this._type][this._port]
  if (cached) {
    cached.wrappers.splice(cached.wrappers.indexOf(this), 1)
    if (!cached.wrappers.length) {
      cached.socket.close()
      delete SOCKETS[this._type][this._port]
    }
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

;['address', 'unref', 'ref'].forEach(function(method) {
  Socket.prototype[method] = function() {
    return this.socket[method].apply(this.socket, arguments)
  }
})

function bindEvents(socket) {
  ['message', 'error'].forEach(function(event) {
    var method = event === 'close' ? 'once' : 'on'
    socket[method](event, function() {
      var wrappers
      var port
      try {
        port = socket.address().port
        var cached = SOCKETS[socket.type][port]
        if (!cached) throw new Error('missing socket wrapper')

        wrappers = cached.wrappers
      } catch (err) {
        var cached = SOCKETS[socket.type]
        for (var port in cached) {
          var sw = cached[port].wrappers
          var found = sw.some(function(w) {
            return w.socket === socket
          })

          if (found) {
            wrappers = sw
            break
          }
        }

        UNDEF.some(function (wrapper) {
          if (wrapper.socket === socket) {
            wrappers = [wrapper]
            return true
          }
        })
      }

      if (!wrappers) throw new Error('missing socket wrapper')

      var args = [].slice.call(arguments)
      args.unshift(event)
      wrappers.forEach(function(wrapper) {
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

function newWrapper (socket) {
  return {
    socket: socket,
    wrappers: []
  }
}
