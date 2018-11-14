# Bandwidth Controller

This program is meant to be invoked by the strongSwan updown plugin. It queries
the Throttling Service to determine bandwidth limits for each new connection,
then programs Linux Traffic Control to enforce those limits. Parameters come
from environment variables set by strongSwan, such as `PLUTO_VERB`.

## Installation

1. Make any changes you need to config.js
2. Copy index.js, package.json, tc.js, throttle_client.js, and config.js to
   the VPN server
3. Run `npm install`
4. Make sure `index.js` is executable
5. Set `leftupdown=/path/to/index.js` for your VPN configuration
6. Run the Throttling Service

See `../test_script.md` for more details.

## Theory of Operation

### Fetching Rate Limits

This program asks a remote service, the Throttling Service, for the rate limit
for a particular client at connect time. The URL to that service is configured
in `config.js`. It's expected to return a JSON response body with the numeric
field `ratelimit_kbps`.

### Throttling

We use the [Hierarchy Token
Bucket](https://www.systutorials.com/docs/linux/man/8-tc-htb/) Linux queueing
discipline to create a "class" for each throttled connection, and a filter to
assign traffic bound to a particular client to that class. With a maximum of
10,000 classes per "qdisc", we use the lower 13 bits (to stay under 10,000) of
the client virtual IP as a unique identifier. For upstream traffic coming from
the client, we use iptables to mark the packets during forwarding so that tc
can determine which client they came from when they get to the outbound
traffic queue.

## Caveats

### Running as root

If you're running strongSwan as a non-root user, this program will be invoked
as that unprivileged user. Making changes to traffic control and firewall rules
require root, so this program will automatically detect that situation and
use `sudo` to run its commands. You'll need to add something like the following
to `/etc/sudoers` to give it the permission to run these commands:

    strongswan     ALL=NOPASSWD: /sbin/tc, /sbin/iptables                                                                                                                                                                                                      │


### Throttling mid-session

This program lacks a mechanism to impose new rate limits mid-session when a user
crosses the threshold to impose rate limiting. The new rate limit won't be
imposed until a new session is established.

## Future work

### Complete IPv6 support

This program is designed to be compatible with IPv6 VPN tunnels, but some light
work may be required to adapt to the particular implementation of IPv6. In
particular, it assumes all clients will receive IPv4 virtual IPs, even if the
VPN connection is over IPv6.

### Separate upstream & downstream rate limits

The current rate limit approach puts both upstream and downstream traffic into
the same class. It may be useful to classify the two independently and apply
different rate limits to them.

## Glossary

**upstream**: Traffic from VPN customers to servers

**downstream**: Traffic from servers on the internet to VPN customers

**clientNumber**: Unique identifier for a client between 0 and 10,000 based
 on the virtual IP address that strongSwan allocated to it.
