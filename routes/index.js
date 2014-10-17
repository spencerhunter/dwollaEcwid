var express = require('express');
var router = express.Router();
var request = require('request');
var c = require('../config');
var Dwolla = require('dwolla-node')(c.client_id, c.client_secret);
var util = require('util');
var crypto = require('crypto');
var Sequelize = require('sequelize'),
  sequelize = new Sequelize(c.mysql.uri, {
      dialect: "mysql", // or 'sqlite', 'postgres', 'mariadb'
  });

sequelize
  .authenticate()
  .complete(function(err) {
    if ( !! err) {
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
  .sync({})
  .complete(function(err) {
    if ( !! err) {
        console.log('An error occurred while creating the table:', err)
    } else {
        console.log('It worked!')
    }
  });


/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', {
      title: 'Express'
  });
});

router.get('/auth/dwolla', function(req, res) {
  var redirect_uri = c.host + '/oauth_return';
  var authUrl = Dwolla.authUrl(redirect_uri, 'AccountInfoFull');
  return res.redirect(authUrl);
});

router.get('/oauth_return', function(req, res) {
  var code = req.query.code;
  var redirect_uri = c.host + '/oauth_return';
  Dwolla.finishAuth(code, redirect_uri, function(error, auth) {
    req.session.access_token = auth.access_token;
    return res.redirect('/dashboard');
  });
});

router.get('/dashboard', function(req, res) {
  if(req.session.access_token == null) {
    res.redirect('/');
  }
  Dwolla.setToken(req.session.access_token);
  Dwolla.fullAccountInfo(function(err, data) {
    if (err) {
      res.send("There was an error finding your account " + err); // Send Error to page...redirect back to home page to Re-Authenticate.
    }
    User
      .findOrCreate({
        where: {
          dwolla_id: data.Id
        }
      })
      .spread(function(user, created) {
        if (created == true) {
          user.md5_hashVal = makeid();
          user.save();
        }
        console.log(created)
        res.render('dashboard', {
          dId: user.dwolla_id,
          name: user.md5_hashVal
        });
      })
  });
});

router.get('/logout', function (req, res) {
  delete req.session.access_token;
  res.redirect('/');
}); 

router.post('/newCheckout', function(req, res) {
    var destinationId = req.body.x_login; // grab x_login_id from POST, if no dest Id throw gateway error
    var redirect_uri = c.host + '/postPayment?x_relay_url=' + req.body.x_relay_url + '&destinationId=' + destinationId;
    // 'http://requestb.in/1men50c1?x_relay_url=' + req.body.x_relay_url + '&destinationId=' + destinationId;
    var purchaseOrder = {
        destinationId: destinationId,
        total: req.body.x_amount,
        notes: req.body.x_description + ' -- Invoice number: ' + req.body.x_invoice_num
    };
    var params = {
        allowFundingSources: true,
        allowGuestCheckout: true,
        additionalFundingSources: true,
        orderId: req.body.x_invoice_num,
        callback: 'http://requestb.in/p17nx5p1'
    };
    Dwolla.createCheckout(redirect_uri, purchaseOrder, params, function(err, checkout) {
        if (err) console.log(err);
        res.redirect(checkout.checkoutURL);
    });
});

router.post('/postPayment', function(req, res) {
    //if error is !null then display error and give the user the option to kickoff a new checkout??
    if (req.query['error'] != null){
      //change this to render postPayment page and display error. Also, request.post bad details to send the user back to the store.
      res.render('There was an error with the checkout. Error description: ' + req.query['error_description']); 
    }
    // Grab Dwolla's proposed signature
    signature = req.query['signature'];
    // Grab Dwolla's checkout ID
    checkout_id = req.query['checkoutId'];
    // Grab the reported total transaction amount
    amount = req.query['amount'];
    // Grab the transaction Id
    transaction_id = req.query['destinationTransaction'];
    //Grab the relay url
    x_relay_url = req.query['x_relay_url'];
    //Grab the order ID
    orderId = req.query['orderId'];
    // Verify the proposed signature
    did_verify = Dwolla.verifyGatewaySignature(signature, checkout_id, amount);

    if (did_verify) {
        console.log("Verified");
        User.find({
            where: {
                dwolla_id: req.query['destinationId'] //change to x_login_id
            }
        }).then(function(user) {
            var hash_val = user.md5_hashVal;
            var loginId = user.dwolla_id;
            var hashstring = hash_val + loginId + transaction_id + amount;
            var md5hashstring = crypto.createHash('md5').update(hashstring).digest('hex');
            request.post(
                x_relay_url, {
                    form: {
                        x_response_code: 1,
                        x_response_reason_code: 1,
                        x_response_reason_text: 'This transaction has been approved.',
                        x_trans_id: transaction_id,
                        x_invoice_num: orderId,
                        x_amount: amount,
                        x_MD5_hash: md5hashstring
                    }
                },
                function(error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log(body);
                    } //else display error of POST to Ecwid
                    console.log("Successful post. Redirecting back to merchant.");
                    res.send(body); //replace with page with body 
                })
        }).catch(function(err) {
            console.log("account not found " + err);
            //If account is not found then display message to user that merchant has not configured dwolla integration properly. 
            //Contact merchant for details.
        })
    } else {
      //
        return res.send("<p>Dwolla's signature failed to verify. You shouldn't process the order before some manual verification. Please check you Dwolla dashboard on dwolla.com</p>");
    }

});

function makeid() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 19; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}


module.exports = router;