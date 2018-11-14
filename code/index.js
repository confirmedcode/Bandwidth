#!/usr/bin/env node

'use strict'
const child_process = require('child_process')

const {logger} = require('log-driver')

const config = require('./config')
const tc = require('./tc')
const throttle = require('./throttle_client')

function upHost(env) {
  return new Promise((resolve) => {
    const remoteHost = env.PLUTO_PEER
    const remotePort = env.PLUTO_UDP_ENC
    const remoteSourceIp = env.PLUTO_PEER_SOURCEIP
    var peerId = env.PLUTO_PEER_ID
    if (peerId.startsWith("CN=")) {
      peerId = peerId.slice(3);
    }
    throttle.getRateLimit(peerId).then((rateLimitKbps) => {
      if (rateLimitKbps === null || rateLimitKbps === undefined) {
        // don't throttle, because there's no rate limit for this client
      } else {
        tc.throttle(remoteHost, remotePort, remoteSourceIp, rateLimitKbps)
      }
      resolve()
    }, (err) => {
      logger.error(err)
    })
  })
}

function downHost(env) {
  return new Promise((resolve) => {
    const remoteHost = env.PLUTO_PEER
    const remotePort = env.PLUTO_UDP_ENC
    const remoteSourceIp = env.PLUTO_PEER_SOURCEIP
    tc.unthrottle(remoteHost, remotePort, remoteSourceIp)
    resolve()
  })
}

const plutoHandlers = {
  'up-host': upHost,
  'up-client': upHost,
  'up-host-v6': upHost,
  'up-client-v6': upHost,

  'down-host': downHost,
  'down-client': downHost,
  'down-host-v6': downHost,
  'down-client-v6': downHost,
}

function handlePlutoVerb(plutoVerb, environment) {
  const handler = plutoHandlers[plutoVerb]
  if (handler !== undefined) {
    return handler(environment)
  }
}

function main() {
  // call the default updown script
  if (config.leftfirewall) {
    console.log(child_process.spawnSync(config.defaultUpdownScript, ['iptables'], {'encoding': 'utf8'}).stdout)
  } else {
    console.log(child_process.spawnSync(config.defaultUpdownScript, {'encoding': 'utf8'}).stdout)
  }

  // make sure traffic control is initialized
  tc.initialize()

  // invoke the appropriate handler, based on PLUTO_VERB
  const plutoVerb = process.env.PLUTO_VERB
  if (plutoVerb === undefined) {
    console.log('ERROR - Expected PLUTO_VERB environment variable to be set')
    process.exit(1)
  }
  handlePlutoVerb(plutoVerb, process.env)
}

if (require.main === module) {
  main()
}

// for testing
module.exports = {
  handlePlutoVerb: handlePlutoVerb
}