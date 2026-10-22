const mongoose = require('mongoose')

// Kasutaja kirje MongoDB-s: username, password ja role
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true }
}, { versionKey: false })

module.exports = mongoose.model('User', userSchema)
