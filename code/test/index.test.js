const assert = require('assert')
const http = require('http')

const bandwidthController = require('../index')
const config = require('../config')
const tc = require('../tc')

describe('bandwidth controller', () => {
  beforeEach(() => {
    tc._test_reset()
  })

  it('should query rate limit and install it on up-host', (done) => {
    const stubServer = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
      })
      res.write('{"downstream_kbps": 456}', 'utf8')
      res.end()
    })
    stubServer.listen(0, '127.0.0.1', () => {
      const port = stubServer.address().port
      config.throttlingService = `http://localhost:${port}/`
      bandwidthController.handlePlutoVerb('up-host', {
        'PLUTO_PEER': '1.2.3.5',
        'PLUTO_PEER_PORT': '0',
        'PLUTO_PEER_ID': 'CN=asdf',
        'PLUTO_PEER_SOURCEIP': '10.1.2.3',
      }).then(() => {
        stubServer.close()
      }).then(() => {
        assert.equal(tc._last_exec_command(0), 'tc filter add dev eth0 protocol ip parent 1: prio 10525 handle 525 fw flowid 1:525')
        assert.equal(tc._last_exec_command(1), 'iptables -A FORWARD --src 10.1.2.3/32 -j MARK --set-mark 525')
        assert.equal(tc._last_exec_command(2), 'tc filter add dev eth0 protocol ip parent 1: prio 525 u32 match ip dst 1.2.3.5/32 flowid 1:525')
        assert.equal(tc._last_exec_command(3), 'tc class add dev eth0 parent 1: classid 1:525 htb rate 456kbit')
        done()
      })
    })
  })

  it('should remove throttling on down-host', (done) => {
    tc._next_exec_result('filter parent 1: protocol ip pref 525 u32\n' +
      'filter parent 1: protocol ip pref 525 u32 fh 800: ht divisor 1\n' +
      'filter parent 1: protocol ip pref 525 u32 fh 800::800 order 2048 key ht 800 bkt 0 flowid 1:525\n' +
      '  match 01020305/ffffffff at 16')
    bandwidthController.handlePlutoVerb('down-host', {
      'PLUTO_PEER': '1.2.3.5',
      'PLUTO_PEER_PORT': '0',
      'PLUTO_PEER_SOURCEIP': '10.1.2.3',
    }).then(() => {
      assert.equal(tc._last_exec_command(0), 'tc class del dev eth0 classid 1:525')
      assert.equal(tc._last_exec_command(1), 'iptables -D FORWARD --src 10.1.2.3/32 -j MARK --set-mark 525')
      assert.equal(tc._last_exec_command(2), 'tc filter del dev eth0 protocol ip prio 10525')
      assert.equal(tc._last_exec_command(3), 'tc filter del dev eth0 protocol ip prio 525')
      done()
    })
  })

  it('should not try to remove throttling on down-host if it is not present', (done) => {
    bandwidthController.handlePlutoVerb('down-host', {
      'PLUTO_PEER': '1.2.3.7',
      'PLUTO_PEER_PORT': '0',
      'PLUTO_PEER_SOURCEIP': '10.1.2.3',
    }).then(() => {
      // the last thing that happened should be enumerating filters, because
      // nothing was found so we can't delete anything.
      assert.equal(tc._last_exec_command(0), 'tc filter show dev eth0 prio 525')
      done()
    })
  })
})