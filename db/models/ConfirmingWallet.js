const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ConfirmingWallet = new Schema({
        owner:{
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        address: {
            type: String,
            default: ''
        },
        balancePfr:{
            type: String,
            default: '0'
        },
        countNode:{
            type: String,
            default: '0'
        },
        date: {
            type: Date,
            default: Date.now
        },

});

module.exports = mongoose.model('ConfirmingWallet', ConfirmingWallet);