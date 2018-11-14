module.exports = {
  'throttlingService': process.env.THROTTLING_SERVICE_URL,
  'ethDevice': process.env.THROTTLING_ETH_DEVICE,
  'maxBandwidth': process.env.THROTTLING_MAX_BANDWIDTH,
  'defaultUpdownScript': process.env.THROTTLING_DEFAULT_UPDOWN_SCRIPT,
  // Since we can't have updown and firewall at the same time in ipsec.conf,
  // we make it a parameter here.
  'leftfirewall': process.env.THROTTLING_LEFT_FIREWALL == 'true',
  // We always throttle downstream traffic to clients. This determines whether
  // we also throttle upstream traffic in the same bucket.
  'throttleUpstream': process.env.THROTTLE_UPSTREAM == 'true',
}