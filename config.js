module.exports = {
  token: process.env.DWOLLA_OAUTH_TOKEN || null
  , client_id: process.env.DWOLLA_CLIENT_ID || null
  , client_secret: process.env.DWOLLA_CLIENT_SECRET || null
  , pin: process.env.DWOLLA_PIN || null
  , host: process.env.HOST || 'http://localhost:3000'
  , mysql: {
  	uri: process.env.CLEARDB_DATABASE_URL || 'mysql://root:root@localhost:3306/ecwidTesting',
  }
}