const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Message = new Schema({
    sender : {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    text : {
        type: String
    },
    deal : {
        type: Schema.Types.ObjectId,
        ref: 'Deal'
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    type: {
        type: String,
        default: 'message' // message, system
    }
});

module.exports = mongoose.model('Message', Message);