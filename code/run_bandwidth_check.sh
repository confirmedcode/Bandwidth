ENVIRONMENT=$(cat /home/ubuntu/environment)
NODE_ENV=PRODUCTION \
THROTTLING_SERVICE_URL=http://helper.$ENVIRONMENT-private/bandwidth-restriction \
THROTTLING_ETH_DEVICE=$(cat /home/ubuntu/ethdevice) \
THROTTLING_MAX_BANDWIDTH=1gbit \
THROTTLING_DEFAULT_UPDOWN_SCRIPT=/usr/lib/ipsec/_updown \
THROTTLING_LEFT_FIREWALL=false \
THROTTLING_THROTTLE_UPSTREAM=true \
/home/ubuntu/bandwidth/index.js 2>&1 >> /home/ubuntu/bandwidth-node.log