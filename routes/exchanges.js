const express = require('express');
const router = express.Router();

const Exchange = require('../db/models/Exchange.js');
const Review = require('../db/models/Review.js');
const Crypto = require('../db/models/crypto/Crypto');

const mongoose = require('mongoose');
const passport = require('passport');
const config = require('../config/database');
require('../config/passport')(passport);
const jwt = require('jsonwebtoken');

const stringLodash = require('lodash/string');

const validator = require('express-validator');

router.use(validator({
    customValidators: {
        checkRelation: (limits) => {
            return new Promise((resolve, reject) => {
                if (limits.min && limits.max) {
                    if ((limits.min > 0) && (limits.max > 0)){
                        if (limits.max >= limits.min) {
                            resolve();
                        } else {
                            reject();
                        }
                    } else {
                        reject();
                    }
                }else if ((limits.min == '') && (limits.max > 0)) {
                    limits.min = 1;
                    resolve();
                } else if ((limits.min > 0) && (limits.max == '')) {
                    limits.max = Infinity;
                    resolve();
                } else if ((limits.min == '') && (limits.max == '')) {
                    limits.min = 1;
                    limits.max = Infinity;
                    resolve();
                }
                console.log(limits);
                reject();
            });
        }
    }
}));







router.get('/', passport.authenticate('jwt', { session: false}), (req, res) => {
    let {offset, limit, order, sortBy} = req.query;
    order = order === 'true' ? -1 : 1;
    let totalItems = 0;
    Exchange.count({owner: req.user._id})
        .then(total => {
            totalItems = total;
            return Exchange.find({owner: req.user._id})
                .sort({
                    [sortBy]: order
                })
                .skip(+offset)
                .limit(+limit)
        }).then(docs => {
            return res.json({total: totalItems, data: docs});
        }).catch(error => res.json(error));
});

router.get('/list', async (req, res) => {
    try {
        let {offset, limit, order, sortBy, type, coin, currency, payment} = req.query;
        order = order === 'true' ? -1 : 1;
        let conditions = {status: 'active'};
        if (type) {
            if (type === 'sell') {
                conditions.tradeType = 'buy';
            } else {
                conditions.tradeType = 'sell';
            }
        }
        if (coin) {
            conditions.coin = coin.toUpperCase();
        }
        if (currency) {
            conditions.currency = currency.toUpperCase();
        }
        if (payment) {
            conditions.paymentType = payment;
        }

        const total = await Exchange.count(conditions);
        const items = await Exchange.aggregate([
            {
                $match: conditions
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'owner',
                    foreignField: '_id',
                    as: 'owner'
                }
            },
            {
                $project: {
                    'owner.password': false,
                    'owner.wallet': false
                }
            },
            {
                $unwind: '$owner'
            },
            {
                $sort: {
                    'owner.online.status': -1,
                    [sortBy]: order
                }
            },
            {
                $skip: +offset
            },
            {
                $limit: +limit
            }
        ]);
        return res.json({total: total, data: items});
    } catch(err) {
        return res.status(500).json(err);
    }
});

router.post('/edit/:id', passport.authenticate('jwt', { session: false}), (req, res) => {
    if (req.user.type !== 'client') {
        return res.status(403).json({error: "Forbidden"});
    }
    req.checkBody({
        rate: {
            notEmpty: {
                errorMessage: 'Field is required'
            },
            matches: {
                options: /^([0-9]+[.])?[0-9]+$/i,
                errorMessage: 'Wrong rate. Use only digits and one dot'
            }
        },
        conditions:{
            isLength: {
                options: {
                    max: 700
                },
                errorMessage: 'Too many characters (maximum 700)'
            }
        },
        paymentTypeDetail:{
            isLength: {
                options: {
                    max: 100
                },
                errorMessage: 'Too many characters (maximum 100)'
            }
        },
        limits: {
            checkRelation: {
                errorMessage: 'The minimum value is greater than the maximum'
            }
        },
    });
    req.getValidationResult().then(result => {
        if (result.array().length > 0) {
            return res.status(400).json({success: false, errors: result.mapped(), msg: 'Bad request'});
        }
        if (parseFloat(req.body.rate) === 0) {
            return res.status(400).json({success: false, errors: {rate: {location: 'body', msg: 'Rate must be more than zero', param: 'rate', value: 0}}, msg: 'Bad request'});
        }
        Exchange.findOne({
            eId: req.params.id
        }).then(doc => {
            if (!doc) {
                return res.status(404).json({error: "Exchange not found"});
            }
            if (doc.owner.toString() !== req.user._id.toString()){
                return res.status(403).json({error: "You can't edit this exchange"});
            }
            if (doc.status !== 'active'){
                return res.status(403).json({error: "You can't edit this exchange"});
            }

            doc.paymentTypeDetail = stringLodash.escape(req.body.paymentTypeDetail);
            doc.rate = req.body.rate;
            doc.conditions = stringLodash.escape(req.body.conditions);
            doc.limits = req.body.limits;

            return doc.save();
        }).then(doc => {
            return res.json(doc);
        }).catch(err => {
            console.log(err);
        });
    });
});

router.get('/:id', function(req, res){
    Exchange
        .findOne({eId: req.params.id})
        .populate('owner', ['_id', 'username'])
        .then(doc => {
            return new Promise((resolve, reject) => {
                Review
                .find({user: doc.owner._id})
                .populate('author', ['-password', '-wallet'])
                .then(reviews => {
                    resolve({exchange: doc, reviews: reviews})
                })
                .catch(err => {
                    reject(err);
                });
            });
        })
        .then(doc => {
            if (doc.error){
                return res.status(404).json(doc.error);
            }
            return res.json(doc);
        })
        .catch(err => {
            return res.status(500).json(err);
        });
});

router.post('/create', passport.authenticate('jwt', {session: false}), async (req, res) => {
    try{
        if (req.user.type !== 'client') {
            return res.status(403).json({error: "Forbidden"});
        }

        let arrNameCoins = [];

        let arrCoin = await Crypto.find({});

        for (let coin of arrCoin){
            arrNameCoins.push(coin.name);
        }


        req.checkBody({
            tradeType: {
                notEmpty: {
                    errorMessage: 'Field is required'
                }
            },
            coin: {
                notEmpty: {
                    errorMessage: 'Currency is required'
                },
                isIn: {
                    options: [arrNameCoins], //['PFR', 'ETH', 'OMG']
                    errorMessage: 'Wrong currency'
                }
            },
            conditions:{
                isLength: {
                    options: {
                        max: 700
                    },
                    errorMessage: 'Too many characters (maximum 700)'
                }
            },
            paymentType: {
                notEmpty: {
                    errorMessage: 'Field is required'
                }
            },
            paymentTypeDetail:{
                isLength: {
                    options: {
                        max: 100
                    },
                    errorMessage: 'Too many characters (maximum 100)'
                }
            },
            currency: {
                notEmpty: {
                    errorMessage: 'Field is required'
                }
            },
            rate: {
                notEmpty: {
                    errorMessage: 'Field is required'
                },
                matches: {
                    options: /^([0-9]+[.])?[0-9]+$/i,
                    errorMessage: 'Wrong rate. Use only digits and one dot'
                },
            },
            limits: {
                checkRelation: {
                    errorMessage: 'The minimum value is greater than the maximum'
                }
            }
        });
        req.getValidationResult().then(result => {
            if (result.array().length > 0) {
                return res.status(400).json({success: false, errors: result.mapped(), msg: 'Bad request'});
            }
            if (req.body.rate == 0) {
                return res.status(400).json({success: false, errors: {rate: {location: 'body', msg: 'Rate must be more than zero', param: 'rate', value: 0}}, msg: 'Bad request'});
            }
            let ex = {
                _id: new mongoose.Types.ObjectId(),
                owner: req.user._id,
                tradeType: stringLodash.escape(req.body.tradeType),
                coin: req.body.coin,
                paymentType: stringLodash.escape(req.body.paymentType),
                paymentTypeDetail: stringLodash.escape(req.body.paymentTypeDetail),
                currency: stringLodash.escape(req.body.currency),
                rate: req.body.rate,
                conditions: stringLodash.escape(req.body.conditions),
                limits: req.body.limits
            };
            new Exchange(ex).save()
                .then(result => res.json({success: true, exchange: result}))
                .catch(err => res.status(500).json({success: false, error: err}));
        });
    }
    catch (err){
        console.log(err);
        return res.status(500);
    }
});

router.post('/close', passport.authenticate('jwt', { session: false}), (req, res) => {
    if (req.user.type !== 'client') {
        return res.status(403).json({error: "Forbidden"});
    }
    Exchange.findOne({
        eId: req.body.id, owner: req.user._id
    })
        .then(ex => {
            if (!ex){
                return res.status(404).json({success: false, error: "Exchange not found"});
                //throw {msg: "Exchange not found"};
            }
            if (ex.owner.toString() !== req.user._id.toString()){
                throw {msg: "You don't have permissions"};
            }

            ex.status = 'closed';
            return ex.save();
        })
        .then(ex => {
            return res.json(ex);
        })
        .catch(err => {
            console.log(err);
            return res.status(500).json({success: false, error: err});
        });
});

module.exports = router;