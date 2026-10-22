const mongoose = require('mongoose')

// Mängu kirje MongoDB-s: id (number), name ja price
const gameSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }
}, { versionKey: false })

module.exports = mongoose.model('Game', gameSchema)
