'use strict'

const http = require('http')

const config = require('./config')

module.exports = {
  getRateLimit(peerId) {
    return new Promise((resolve, reject) => {
      const peerEncoded = encodeURIComponent(peerId)
      const url = `${config.throttlingService}?client_id=${peerEncoded}`
      http.get(url, (res) => {
        const statusCode = res.statusCode
        const contentType = res.headers['content-type']

        let error
        if (statusCode !== 200) {
          error = new Error('Request Failed. ' +
            `Status Code: ${statusCode}`)
        } else if (!/^application\/json/.test(contentType)) {
          error = new Error('Invalid content-type. ' +
            `Expected application/json but received ${contentType}`)
        }
        if (error) {
          // consume response data to free up memory
          res.resume()
          reject(error)
        }

        res.setEncoding('utf8')
        let rawData = ''
        res.on('data', (chunk) => rawData += chunk)
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData)
            resolve(parsedData['ratelimit_kbps'])
          } catch (e) {
            reject(e)
          }
        })
      }).on('error', (e) => {
        reject(e)
      })
    })
  },
}
