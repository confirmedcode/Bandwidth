const assert = require('assert')

const tc = require('../tc')
const config = require('../config')

describe('tc module', () => {
  beforeEach(() => {
    config.ethDevice = 'xyxy0'
    tc._test_reset()
  })

  describe('getClientNumber()', () => {
    it('should use lower 13 bits of virtual IP to get a number', () => {
      assert.equal(tc._getClientNumber('10.0.0.1'), 11)
      assert.equal(tc._getClientNumber('1.2.3.5'), 783)
    })
  })

  describe('tc()', () => {
    it('should prepend `tc` to commands', () => {
      assert.equal(tc._tc(['filter', 'show', 'dev', 'eth0']), '')
      assert.equal(tc._last_exec_command(0), 'tc filter show dev eth0')
    })
  })

  describe('addClass()', () => {
    it('should add a class to the configured device', () => {
      tc._addClass(1234, 444)
      assert.equal(tc._last_exec_command(0), 'tc class add dev xyxy0 parent 1: classid 1:1234 htb rate 444kbit')
    })
  })

  describe('addIpFilter()', () => {
    it('should add a filter to the configured device without UDP port filtering', () => {
      tc._addIpFilter('5.4.3.2', undefined, 1234, 1234)
      assert.equal(tc._last_exec_command(0), 'tc filter add dev xyxy0 protocol ip parent 1: prio 1234 u32 match ip dst 5.4.3.2/32 flowid 1:1234')
    })

    it('should add a filter to the configured device with UDP port filtering', () => {
      tc._addIpFilter('5.4.3.2', '4545', 1234, 1234)
      assert.equal(tc._last_exec_command(0), 'tc filter add dev xyxy0 protocol ip parent 1: prio 1234 u32 match ip dst 5.4.3.2/32 match ip dport 4545 0xffff flowid 1:1234')
    })
  })

  describe('parseFilter()', () => {
    it('should parse IPv4', () => {
      const result = tc._parseFilter('filter parent 1: protocol ip u32\n' +
        'filter parent 1: protocol ip u32 fh 802: ht divisor 1\n' +
        'filter parent 1: protocol ip u32 fh 802::800 order 2048 key ht 802 bkt 0 flowid 1:9765\n' +
        '  match ac1f5dd9/ffffffff at 16')
      assert.deepEqual(result, {
        classid: '9765',
        ip: '172.31.93.217',
        port: undefined,
        protocol: 'ip',
      })
    })
    it('should parse IPv4 UDP port match', () => {
      const result = tc._parseFilter('filter parent 1: protocol ip u32\n' +
        'filter parent 1: protocol ip u32 fh 803: ht divisor 1\n' +
        'filter parent 1: protocol ip u32 fh 803::800 order 2048 key ht 803 bkt 0 flowid 1:9765\n' +
        '  match ac1f5dd9/ffffffff at 16\n' +
        '  match 00001194/0000ffff at 20')
      assert.deepEqual(result, {
        classid: '9765',
        ip: '172.31.93.217',
        port: 4500,
        protocol: 'ip',
      })
    })
    it('should parse IPv6', () => {
      const result = tc._parseFilter('filter parent 1: protocol ipv6 u32\n' +
        'filter parent 1: protocol ipv6 u32 fh 801: ht divisor 1\n' +
        'filter parent 1: protocol ipv6 u32 fh 801::800 order 2048 key ht 801 bkt 0 flowid 1:9638\n' +
        '  match 26001f18/ffffffff at 24\n' +
        '  match 0031dc1d/ffffffff at 28\n' +
        '  match f6fd7056/ffffffff at 32\n' +
        '  match 72bfbdf2/ffffffff at 36')
      assert.deepEqual(result, {
        classid: '9638',
        ip: '2600:1f18:31:dc1d:f6fd:7056:72bf:bdf2',
        port: undefined,
        protocol: 'ipv6',
      })
    })
  })

  describe('removeClass()', () => {
    it('should remove a class from the configured device', () => {
      config.ethDevice = 'xyxy0'
      tc._removeClass(1234)
      assert.equal(tc._last_exec_command(0), 'tc class del dev xyxy0 classid 1:1234')
    })
  })

  describe('removeFilter()', () => {
    it('should remove a filter to the configured device', () => {
      config.ethDevice = 'xyxy0'
      tc._removeFilter(1234, 'ip')
      assert.equal(tc._last_exec_command(0), 'tc filter del dev xyxy0 protocol ip prio 1234')
    })
  })

  describe('initialize()', () => {
    it('should set up qdisc if not present', () => {
      tc._next_exec_result('qdisc pfifo_fast 0: root refcnt 2 bands 3 priomap  1 2 2 2 1 2 0 0 1 1 1 1 1 1 1 1')
      tc.initialize()
      assert.equal(tc._last_exec_command(1), 'tc qdisc add dev xyxy0 root handle 1: htb default 1')
      assert.equal(tc._last_exec_command(0), 'tc class add dev xyxy0 parent 1: classid 1:1 htb rate 1gbit')
    })

    it('should do nothing if already initialized', () => {
      tc._next_exec_result('qdisc htb 1: root refcnt 2 r2q 10 default 1 direct_packets_stat 15076 direct_qlen 1000')
      tc.initialize()
      assert.equal(tc._last_exec_command(0), 'tc qdisc show dev xyxy0')
    })
  })

  describe('throttle()', () => {
    it('should install filter and class', () => {
      tc.throttle('1.2.3.4', undefined, '10.3.4.5', 555)
      assert.equal(tc._last_exec_command(0), 'tc filter add dev xyxy0 protocol ip parent 1: prio 11039 handle 1039 fw flowid 1:1039')
      assert.equal(tc._last_exec_command(1), 'iptables -A FORWARD --src 10.3.4.5/32 -j MARK --set-mark 1039')
      assert.equal(tc._last_exec_command(2), 'tc filter add dev xyxy0 protocol ip parent 1: prio 1039 u32 match ip dst 1.2.3.4/32 flowid 1:1039')
      assert.equal(tc._last_exec_command(3), 'tc class add dev xyxy0 parent 1: classid 1:1039 htb rate 555kbit')
    })

    it('should install the right filter for IPv6', () => {
      tc.throttle('2600:1f18:31:dc1d:f6fd:7056:72bf:bdf2', undefined, '10.3.4.5', 555)
      assert.equal(tc._last_exec_command(0), 'tc filter add dev xyxy0 protocol ip parent 1: prio 11039 handle 1039 fw flowid 1:1039')
      assert.equal(tc._last_exec_command(1), 'iptables -A FORWARD --src 10.3.4.5/32 -j MARK --set-mark 1039')
      assert.equal(tc._last_exec_command(2), 'tc filter add dev xyxy0 protocol ipv6 parent 1: prio 1039 u32 match ip6 dst 2600:1f18:31:dc1d:f6fd:7056:72bf:bdf2/128 flowid 1:1039')
      assert.equal(tc._last_exec_command(3), 'tc class add dev xyxy0 parent 1: classid 1:1039 htb rate 555kbit')
    })
  })

  describe('unthrottle()', () => {
    it('should remove filter and class', () => {
      tc._next_exec_result("filter parent 1: protocol ip pref 6079 u32\n" +
        "filter parent 1: protocol ip pref 6079 u32 fh 800: ht divisor 1\n" +
        "filter parent 1: protocol ip pref 6079 u32 fh 800::800 order 2048 key ht 800 bkt 0 flowid 1:6079\n" +
        "  match ac1f5dd9/ffffffff at 16")
      tc.unthrottle('172.31.93.217', undefined, '10.254.254.254')
      assert.equal(tc._last_exec_command(0), 'tc class del dev xyxy0 classid 1:6079')
      assert.equal(tc._last_exec_command(1), 'iptables -D FORWARD --src 10.254.254.254/32 -j MARK --set-mark 6079')
      assert.equal(tc._last_exec_command(2), 'tc filter del dev xyxy0 protocol ip prio 16079')
      assert.equal(tc._last_exec_command(3), 'tc filter del dev xyxy0 protocol ip prio 6079')
    })
    it('should gracefully handle no filter found', () => {
      tc._next_exec_result('')
      tc.unthrottle('6.5.4.3', undefined, '10.3.4.5')
    })
    it('should remove IPv6 filter', () => {
      tc._next_exec_result("filter parent 1: protocol ipv6 u32\n" +
        "filter parent 1: protocol ipv6 u32 fh 801: ht divisor 1\n" +
        "filter parent 1: protocol ipv6 u32 fh 801::800 order 2048 key ht 801 bkt 0 flowid 1:9638\n" +
        "  match 26001f18/ffffffff at 24\n" +
        "  match 0031dc1d/ffffffff at 28\n" +
        "  match f6fd7056/ffffffff at 32\n" +
        "  match 72bfbdf2/ffffffff at 36")
      tc.unthrottle('2600:1f18:31:dc1d:f6fd:7056:72bf:bdf2', undefined, '10.2.2.2')
      assert.equal(tc._last_exec_command(0), 'tc class del dev xyxy0 classid 1:9638')
      assert.equal(tc._last_exec_command(1), 'iptables -D FORWARD --src 10.2.2.2/32 -j MARK --set-mark 9638')
      assert.equal(tc._last_exec_command(2), 'tc filter del dev xyxy0 protocol ip prio 19638')
      assert.equal(tc._last_exec_command(3), 'tc filter del dev xyxy0 protocol ipv6 prio 9638')
    })
  })
})
