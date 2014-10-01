var express = require('express');
var router = express.Router();
var request = require('request');
var c = require('../config');
var Dwolla = require('dwolla-node')(c.client_id, c.client_secret);
var util = require('util');
var rest = require('restler');
var Sequelize = require('sequelize')
  , sequelize = new Sequelize('ecwidTesting', 'root', 'root', {
      dialect: "mysql", // or 'sqlite', 'postgres', 'mariadb'
      port:    3306, // or 5432 (for postgres)
    });

 sequelize
  .authenticate()
  .complete(function(err) {
    if (!!err) {
      console.log('Unable to connect to the database:', err)
    } else {
      console.log('Connection has been established successfully.')
    }
  });

var User = sequelize.define('User', {
  dwolla_id: Sequelize.STRING,
  md5_hashVal: Sequelize.STRING
});

sequelize
  .sync({  })
  .complete(function(err) {
     if (!!err) {
       console.log('An error occurred while creating the table:', err)
     } else {
       console.log('It worked!')
     }
  });



/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

router.get('/auth/dwolla', function(req, res) {
	var redirect_uri = c.host + '/oauth_return';
    var authUrl = Dwolla.authUrl(redirect_uri,'AccountInfoFull');

    return res.redirect(authUrl);
});

router.get('/oauth_return', function(req, res) {
    var code = req.query.code;
    var redirect_uri = c.host + '/oauth_return';
    Dwolla.finishAuth(code, redirect_uri, function(error, auth) {
        var output = "Your OAuth access_token is: <b>" + auth.access_token + "</b>, which will expire in " + auth.expires_in + " seconds.<br>Your refresh_token is: <b>" + auth.refresh_token + "</b>, and that'll expire in " + auth.refresh_expires_in + " seconds.";
        output += '<br><a href="/refresh?refreshToken=' + encodeURIComponent(auth.refresh_token) + '">Click here to get a new access and refresh token pair!</a>';
        req.session.access_token = auth.access_token;
        return res.redirect('/dashboard');
    });
});

router.get('/dashboard', function(req, res) {
	Dwolla.setToken(req.session.access_token);
	Dwolla.fullAccountInfo(function(err, data) {
    if (err) { console.log(err); }
    console.log(data);
    console.log(typeof data.Id);
    User
      .findOrCreate({where: {dwolla_id: data.Id}})
      .spread(function(user, created) {
      	if (created == true){
      		user.md5_hashVal = makeid();
      		user.save();
      	} 
        console.log(created)
        res.render('dashboard', {dId: user.dwolla_id, name: user.md5_hashVal});
      })
	});
});

router.post('/newCheckout', function(req, res){
	//var redirect_uri = 'http://localhost:3000/postPayment?x_relay_url='+ req.body.x_relay_url;
  var ref = req.header['referer'];
  console.log(ref);
	var redirect_uri = c.host + '/postPayment/?x_relay_url=' + req.body.x_relay_url + '&referer=' + ref;
	console.log(redirect_uri);
	var purchaseOrder = {
     destinationId: req.body.x_login,
     total: req.body.x_amount,
     notes: req.body.x_description + ' & Invoice number: ' + req.body.x_invoice_num
    };
    console.log(purchaseOrder);
    var params = {
     allowFundingSources: true,
     allowGuestCheckout: true,
     additionalFundingSources: true,
     orderId: req.body.x_invoice_num,
     callback: 'http://requestb.in/17bu6xh1'
    };
    console.log(params);
   Dwolla.createCheckout(redirect_uri, purchaseOrder, params, function(err, checkout) {
     if (err) console.log(err);
     res.send(util.format('Checkout created.  Click to continue: <a href="%s">%s</a>', checkout.checkoutURL, checkout.checkoutURL));
    });
});

router.get('/postPayment', function(req, res) {
		// Grab Dwolla's proposed signature
    signature = req.query['signature'];
    // Grab Dwolla's checkout ID
    checkout_id = req.query['checkoutId'];
    // Grab the reported total transaction amount
    amount = req.query['amount'];
    // Grab the transaction Id
    transaction_id = req.query['TransactionId'];
    // Verify the proposed signature
    did_verify = Dwolla.verifyGatewaySignature(signature, checkout_id, amount)

	    if (did_verify) {
	        return res.send("<p>Dwolla's signature verified successfully. You should go ahead and process the order.</p>");
	    } else {
	        return res.send("<p>Dwolla's signature failed to verify. You shouldn't process the order before some manual verification.</p>");
	    }
    User.find({ where: {dwolla_id: req.query['destinationId']} }).success(function(user) {
      var hash_val = user.md5_hashVal;
    });
    
    request.post(
    req.query['x_relay_url'],
    { form: { x_response_code: 1, x_response_reason_code: 1, x_trans_id: transaction_id, x_amount: amount, x_MD5_hash: md5hashstring } },
    function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log(body)
        }
        res.redirect('http://store5380004.ecwid.com/');
    }
);

});

function makeid()
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 19; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}


module.exports = router;
