require('dotenv').config()
const mongoose = require('mongoose')
const express = require('express')
const Game = require('./models/Game')
const User = require('./models/User')
const app = express()
const port = 8080
const swaggerUi = require('swagger-ui-express')
const yamljs = require('yamljs')
const swaggerDocument = yamljs.load('./docs/swagger.yaml');

app.use(express.json())

// Algandmed: salvestatakse andmebaasi ainult siis, kui andmebaas on tühi
const seedGames = [
    {id: 1, name: "Witcher 3", price: 29.99},
    {id: 2, name: "Cyberpunk 2077", price: 59.99},
    {id: 3, name: "Minecraft", price: 26.99},
    {id: 4, name: "Counter-Strike: Global Offensive", price: 0},
    {id: 5, name: "Roblox", price: 0},
    {id: 6, name: "Grand Theft Auto V", price: 29.99},
    {id: 7, name: "Valorant", price: 0},
    {id: 8, name: "Forza Horizon 5", price: 59.99}
]

const seedUsers = [
    {username: "admin", password: "admin123", role: "admin"},
    {username: "user", password: "user123", role: "user"}
]

// Võtab päisest Authorization kasutajanime ja parooli ning otsib kasutaja andmebaasist
async function findUser(req) {
    const auth = (req.headers.authorization || '').replace('Basic ', '')
    const [username, password] = Buffer.from(auth, 'base64').toString().split(':')
    if (!username || !password) return null

    return User.findOne({username, password}).lean()
}

// Lubab edasi ainult sisse logitud kasutaja
async function requireLogin(req, res, next) {
    if (!(await findUser(req))) {
        return res.status(401).send({error: "Wrong username or password"})
    }
    next()
}

// Lubab edasi ainult admini
async function requireAdmin(req, res, next) {
    const user = await findUser(req)
    if (!user) {
        return res.status(401).send({error: "Wrong username or password"})
    }
    if (user.role != 'admin') {
        return res.status(403).send({error: "Only admin can do this"})
    }
    next()
}

// Kontrollib kasutajanime ja parooli (Swaggeri Authorize nupp kasutab seda)
app.get('/login', requireLogin, (req, res) => {
    res.send({message: "OK"})
})

// Kõik mängud andmebaasist
app.get('/games', async (req, res) => {
    const games = await Game.find({}, {_id: 0}).sort({id: 1}).lean()
    res.send(games)
})

// Ühe mängu kõik andmed andmebaasist
app.get('/games/:id', async (req, res) => {
    const game = await Game.findOne({id: toId(req.params.id)}, {_id: 0}).lean()
    if (!game) {
        return res.status(404).send({error: "Game not found"})
    }

    res.send(game)
})

app.post('/games', async (req, res) => {
    if (!req.body || !req.body.name || !req.body.price) {
        return res.status(400).send({ error: 'One or all params are missing' })
    }
    const exists = await Game.exists({name: {$regex: `^${escapeRegex(req.body.name)}$`, $options: 'i'}})
    if (exists) {
        return res.status(409).send({ error: 'Game with this name already exists' })
    }
    const last = await Game.findOne().sort({id: -1}).lean()
    const game = await Game.create({
        id: (last ? last.id : 0) + 1,
        name: req.body.name,
        price: req.body.price
    })

    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send({id: game.id, name: game.name, price: game.price})
})

app.put('/games/:id', async (req, res) => {
    const game = await Game.findOne({id: toId(req.params.id)})
    if (!game) {
        return res.status(404).send({error: "Game not found"})
    }

    if (!req.body || !req.body.name || !req.body.price) {
        return res.status(400).send({ error: 'One or all params are missing' })
    }

    const exists = await Game.exists({id: {$ne: game.id}, name: {$regex: `^${escapeRegex(req.body.name)}$`, $options: 'i'}})
    if (exists) {
        return res.status(409).send({ error: 'Game with this name already exists' })
    }

    game.name = req.body.name
    game.price = req.body.price
    await game.save()

    res.send({id: game.id, name: game.name, price: game.price})
})

app.delete('/games/:id', requireAdmin, async (req, res) => {
    const deleted = await Game.findOneAndDelete({id: toId(req.params.id)})
    if (!deleted) {
        return res.status(404).send({error: "Game not found"})
    }

    res.status(204).send()
})

const swaggerCss = `
    .dark-mode-toggle, .swagger-ui .authorization__btn { display: none !important }
    .swagger-ui > div { position: relative }
    .swagger-ui .scheme-container { position: absolute; top: 5px; left: 0; right: 0; margin: 0; padding: 0; background: none !important; box-shadow: none !important; pointer-events: none }
    .swagger-ui .scheme-container .auth-wrapper { pointer-events: auto }
`

function hideAdminOperations(system) {
    const canSee = (method) => {
        const username = system.authSelectors.authorized().getIn(['basicAuth', 'value', 'username'])
        if (username == 'admin') return true
        if (username) return method == 'get' || method == 'post'
        return method == 'get'
    }

    return {
        statePlugins: {
            auth: {
                wrapActions: {
                    authorize: (oriAction) => (payload) => {
                        const {username, password} = payload.basicAuth.value
                        fetch('/login', {headers: {Authorization: 'Basic ' + btoa(username + ':' + password)}})
                            .then(res => {
                                if (res.ok) {
                                    oriAction(payload)
                                } else {
                                    alert('Wrong username or password')
                                }
                            })
                            .catch(() => alert('Server is not available'))
                    }
                }
            }
        },
        wrapComponents: {
            operation: (Original, system) => (props) => {
                if (canSee(props.operation.get('method'))) {
                    return system.React.createElement(Original, props)
                }
                return null
            },
            OperationTag: (Original, system) => (props) => {
                if (props.tagObj.get('operations').some(op => canSee(op.get('method')))) {
                    return system.React.createElement(Original, props)
                }
                return null
            }
        }
    }
}

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: swaggerCss,
    swaggerOptions: {plugins: [hideAdminOperations]}
}))

// Ühendab andmebaasiga; kui kogud on tühjad, salvestab sinna algandmed. Alles siis käivitab serveri
mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('Connected to MongoDB')
    if (await Game.countDocuments() == 0) await Game.insertMany(seedGames)
    if (await User.countDocuments() == 0) await User.insertMany(seedUsers)

    app.listen(port, () => {
        console.log(`API up at: http://localhost:${port}`)
    })
}).catch(err => {
    console.error('Could not connect to MongoDB:', err.message)
    process.exit(1)
})

// Teeb kasutaja sisestatud tekstist turvalise regexi (nime võrdlemiseks ilma suur/väike tähe vahet tegemata)
function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getBaseUrl(req) {
    return (req.connection && req.connection.encrypted
        ? 'https' : 'http') + `://${req.headers.host}`
}

// Muudab URL-i id numbriks (kui see pole number, siis null, ehk mängu ei leita)
function toId(value) {
    const id = Number(value)
    return Number.isNaN(id) ? null : id
}
