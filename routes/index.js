var express = require('express');
var router = express.Router();
var request = require('request');
var dwolla = require('dwolla-node');

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
