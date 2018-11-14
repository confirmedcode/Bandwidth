#!/usr/bin/env bash

export PLUTO_PEER_PORT=0
export PLUTO_REQID=35
export PLUTO_PEER_CLIENT=10.1.1.2/32
export PLUTO_UNIQUEID=35
export PLUTO_PEER=172.31.93.217
export PLUTO_ME=172.31.31.91
export PLUTO_MY_PROTOCOL=0
export PLUTO_PEER_ID=172.31.93.217
export PLUTO_VERB=up-host
export PLUTO_INTERFACE=eth0
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PLUTO_PEER_SOURCEIP=10.1.1.2
export PLUTO_PEER_SOURCEIP4_1=10.1.1.2
export PLUTO_MY_PORT=0
export PLUTO_VERSION=1.1
export PLUTO_MY_CLIENT=172.31.31.91/32
export PLUTO_PEER_PROTOCOL=0
export PLUTO_CONNECTION=test
export PLUTO_MY_ID=172.31.31.91
export PLUTO_PROTO=esp

node ./index.js
