'use strict'

/** High-level interface for interacting with Linux Traffic Control **/

const child_process = require('child_process')
const os = require("os")

const ipaddr = require('ipaddr.js')
const {logger} = require('log-driver')

const config = require('./config')


/** Run an external command with the specified arguments. It's okay (and
 *  simpler) for this to be a blocking, synchronous call because this whole
 *  program is invoked synchronously by strongSwan to do one thing and exit. */

// these variables are for testing
let last_exec_commands = []
let next_exec_result = ''

function exec(executable, args) {
  if (os.userInfo().username !== 'root') {
    // need to sudo because we're not running as root
    args.unshift(executable)
    executable = 'sudo'
  }
  const cmd = `${executable} ${args.join(' ')}`
  last_exec_commands.push(cmd)
  if (process.env.NODE_ENV === 'test') {
    const x = next_exec_result
    next_exec_result = ''
    return x
  } else {
    logger.info(`EXEC: ${cmd}`)
    const result = child_process.spawnSync(executable, args, {encoding: 'utf8'})
    if (result.status !== 0) {
      logger.error("ERROR - " + result.stderr)
      process.exit(2)
    }
    return result.stdout
  }
}

function tc(args) {
  return exec('tc', args)
}

function iptables(args) {
  return exec('iptables', args)
}

function getClientNumber(clientVirtualIp) {
  const ipBytes = ipaddr.parse(clientVirtualIp).toByteArray()
  const n = ((ipBytes[ipBytes.length - 2] << 8) | ipBytes[ipBytes.length - 1])

  // add 10 to give us some room for generic rules on top of the per-client ones
  // mask to 13 bits to stay under 10,000
  return 10 + (n & 0x1fff)
}

function addClass(classid, rate) {
  tc(['class', 'add', 'dev', config.ethDevice, 'parent', '1:', 'classid',
    `1:${classid}`, 'htb', 'rate', `${rate}kbit`])
}

function addIpFilter(clientIp, clientPort, clientNumber) {
  if (clientIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    // IPv4
    if (clientPort !== undefined) {
      // NAT-T UDP encap, so let's make sure we only filter on the right port
      tc(['filter', 'add', 'dev', config.ethDevice, 'protocol', 'ip', 'parent',
        '1:', 'prio', clientNumber, 'u32', 'match', 'ip', 'dst', `${clientIp}/32`,
        'match', 'ip', 'dport', clientPort, '0xffff',
        'flowid', `1:${clientNumber}`])
    } else {
      tc(['filter', 'add', 'dev', config.ethDevice, 'protocol', 'ip', 'parent',
        '1:', 'prio', clientNumber, 'u32', 'match', 'ip', 'dst', `${clientIp}/32`,
        'flowid', `1:${clientNumber}`])
    }
  } else {
    // IPv6
    tc(['filter', 'add', 'dev', config.ethDevice, 'protocol', 'ipv6', 'parent',
      '1:', 'prio', clientNumber, 'u32', 'match', 'ip6', 'dst', `${clientIp}/128`,
      'flowid', `1:${clientNumber}`])
  }
}

function addFwFilter(mark) {
  // add 10,000 to prevent conflict with IP filter
  tc(['filter', 'add', 'dev', config.ethDevice, 'protocol', 'ip',
    'parent', '1:', 'prio', mark + 10000, 'handle', mark, 'fw', 'flowid', `1:${mark}`])
}

function addMark(clientVirtualIp, mark) {
  iptables(['-A', 'FORWARD', '--src', `${clientVirtualIp}/32`, '-j', 'MARK',
    '--set-mark', mark.toString()])
}

function removeMark(clientVirtualIp, mark) {
  iptables(['-D', 'FORWARD', '--src', `${clientVirtualIp}/32`, '-j', 'MARK',
    '--set-mark', mark.toString()])
}

function removeFilter(filterPrio, protocol) {
  tc(['filter', 'del', 'dev', config.ethDevice, 'protocol', protocol,
    'prio', filterPrio])
}

function removeClass(classid) {
  tc(['class', 'del', 'dev', config.ethDevice, 'classid', `1:${classid}`])
}

function getFilter(filterPrio) {
  const raw = tc(['filter', 'show', 'dev', config.ethDevice,
    'prio', filterPrio])
  return parseFilter(raw)
}

function parseFilter(raw) {
  if (raw === '') {
    return undefined
  }
  const classid = raw.match(/flowid 1:(\d+)/)[1]

  const ipmatch = /match ([a-f0-9]+)\/ffffffff/g
  const ipParts = []
  let m
  while (m = ipmatch.exec(raw)) {
    ipParts.push(m[1])
  }
  const ip = ipaddr.fromByteArray(Buffer.from(ipParts.join(''), 'hex'))

  const portmatch = raw.match(/match ([a-f0-9]+)\/0000ffff/)
  let port = undefined
  if (portmatch !== null) {
    port = new Buffer(portmatch[1], 'hex').readInt16BE(2).toString()
  }

  return {
    classid: parseInt(classid),
    ip: ip.toString(),
    port: port,
    protocol: (ip instanceof ipaddr.IPv4) ? 'ip' : 'ipv6',
  }
}


module.exports = {
  /** Initialize basic HTB configuration that the individual throttling limits
   * will rely on.
   */
  initialize() {
    const out = tc(['qdisc', 'show', 'dev', config.ethDevice])
    if (out.indexOf('qdisc htb 1:') !== -1) {
      return
    }
    tc(['qdisc', 'add', 'dev', config.ethDevice, 'root', 'handle', '1:', 'htb',
      'default', '1'])
    tc(['class', 'add', 'dev', config.ethDevice, 'parent', '1:',
      'classid', '1:1', 'htb', 'rate', config.maxBandwidth])
  },
  /** Install a rate limit on outbound network traffic to a remote host.
   *
   * @param {string} clientIp - IP address of remote host
   * @param {string} clientPort - (Optional) UDP port number of connection
   * @param {string} clientVirtualIp - Virtual IP assigned to the client
   * @param {number} rate - Kilobits per second of the reate limit
   */
  throttle(clientIp, clientPort, clientVirtualIp, rate) {
    logger.info(`Throttling client at ${rate} kbps`)
    const clientNumber = getClientNumber(clientVirtualIp)
    addClass(clientNumber, rate)
    addIpFilter(clientIp, clientPort, clientNumber)
    if (config.throttleUpstream) {
      addMark(clientVirtualIp, clientNumber)
      addFwFilter(clientNumber)
    }
  },

  /** Uninstall any rate limiting for the given connection. */
  unthrottle(clientIp, clientPort, clientVirtualIp) {
    const filter = getFilter(getClientNumber(clientVirtualIp))
    if (filter !== undefined) {
      removeFilter(filter.classid, filter.protocol)
      if (config.throttleUpstream) {
        removeFilter(filter.classid + 10000, 'ip')
        removeMark(clientVirtualIp, filter.classid)
      }
      removeClass(filter.classid)
    }
  },

  // private exports for testing
  _getClientNumber: getClientNumber,
  _tc: tc,
  _last_exec_command(n) {
    return last_exec_commands[last_exec_commands.length - n - 1]
  },
  _next_exec_result(txt) {
    next_exec_result = txt
  },
  _test_reset() {
    last_exec_commands = []
    next_exec_result = ''
  },
  _addClass: addClass,
  _addIpFilter: addIpFilter,
  _removeFilter: removeFilter,
  _removeClass: removeClass,
  _parseFilter: parseFilter,
}
