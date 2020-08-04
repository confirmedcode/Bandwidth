# Bandwidth Throttling Script (Runs on VPN Server)

Right before a VPN client is connected, the Node.js script `bandwidth/index.js` runs to ask the Helper Server whether or not to throttle that client, and if so, throttles the client using `tc`. Throttling occurs when a user does not have an active subscription, or uses excessive bandwidth.

## How It Works
This script is deployed to every VPN server. It is triggered by the [Updown](https://wiki.strongswan.org/projects/strongswan/wiki/Updown) StrongSwan plugin, which allows a custom script to run every time a connection is established or disconnected.

1) __VPN Client Connects__ `Updown` triggers `bandwidth/index.js` and passes in `client_id` environment variable.

2) `bandwidth/index.js` does a GET on the private network to Helper to check for throttling

`http://helper.[environment]-private/bandwidth-restriction?client_id=[clientId]`

2) Response from Helper

```
{
	ratelimitkbps: 10000
}
```

3) If `ratelimitkbps` is undefined or null, don't throttle. Otherwise, use `tc` to throttle the `client_id`.

4) __VPN Client Disconnects__ `Updown` triggers `bandwidth/index.js`, which removes any throttle of the `client_id`.

## Feedback
If you have any questions, concerns, or other feedback, please let us know any feedback in Github issues or by e-mail.

We also have a bug bounty program -- please email <engineering@confirmedvpn.com> for details.

## License

This project is licensed under the GPL License - see the [LICENSE.md](LICENSE.md) file for details

## Contact

<engineering@confirmedvpn.com>