const express = require('express')
const app = express()
const port = 8080
const swaggerUi = require('swagger-ui-express')
const yamljs = require('yamljs')
const swaggerDocument = yamljs.load('./docs/swagger.yaml');

app.use(express.json())

const games = [
    {id: 1, name: "Witcher 3", price: 29.99},
    {id: 2, name: "Cyberpunk 2077", price: 59.99},
    {id: 3, name: "Minecraft", price: 26.99},
    {id: 4, name: "Counter-Strike: Global Offensive", price: 0},
    {id: 5, name: "Roblox", price: 0},
    {id: 6, name: "Grand Theft Auto V", price: 29.99},
    {id: 7, name: "Valorant", price: 0},
    {id: 8, name: "Forza Horizon 5", price: 59.99}
]

const users = [
    {username: "admin", password: "admin123", role: "admin"},
    {username: "user", password: "user123", role: "user"}
]

function findUser(req) {
    const auth = (req.headers.authorization || '').replace('Basic ', '')
    const [username, password] = Buffer.from(auth, 'base64').toString().split(':')

    return users.find(u => u.username == username && u.password == password)
}

function requireLogin(req, res, next) {
    if (typeof findUser(req) == 'undefined') {
        return res.status(401).send({error: "Wrong username or password"})
    }
    next()
}

function requireAdmin(req, res, next) {
    const user = findUser(req)
    if (typeof user == 'undefined') {
        return res.status(401).send({error: "Wrong username or password"})
    }
    if (user.role != 'admin') {
        return res.status(403).send({error: "Only admin can do this"})
    }
    next()
}

app.get('/login', requireLogin, (req, res) => {
    res.send({message: "OK"})
})

app.get('/games', (req, res) => {
    res.send(games)
})

app.get('/games/:id', (req, res) => {
    const game = games.find(g => g.id == req.params.id)
    if (typeof game === 'undefined') {
        return res.status(404).send({error: "Game not found"})
    }

    res.send(game)
})

app.post('/games', (req, res) => {
    if (!req.body || !req.body.name || !req.body.price) {
        return res.status(400).send({ error: 'One or all params are missing' })
    }
    const exists = games.some(g => g.name.toLowerCase() === req.body.name.toLowerCase())
    if (exists) {
        return res.status(409).send({ error: 'Game with this name already exists' })
    }
    let game = {
        id: Math.max(0, ...games.map(g => g.id)) + 1,
        price: req.body.price,
        name: req.body.name
    }

    games.push(game)

    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send(game)
})

app.put('/games/:id', (req, res) => {
    const game = games.find(g => g.id == req.params.id)
    if (typeof game === 'undefined') {
        return res.status(404).send({error: "Game not found"})
    }

    if (!req.body || !req.body.name || !req.body.price) {
        return res.status(400).send({ error: 'One or all params are missing' })
    }

    const exists = games.some(g => g.id != game.id && g.name.toLowerCase() === req.body.name.toLowerCase())
    if (exists) {
        return res.status(409).send({ error: 'Game with this name already exists' })
    }

    game.name = req.body.name
    game.price = req.body.price

    res.send(game)
})
app.delete('/games/:id', requireAdmin, (req, res) => {
    const index = games.findIndex(g => g.id == req.params.id)
    if (index === -1) {
        return res.status(404).send({error: "Game not found"})
    }

    games.splice(index, 1)

    res.status(204).send({error: "No content"})
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

app.listen(port, () => {
    console.log(`API up at: http://localhost:${port}`)
})

function getBaseUrl(req) {
    return (req.connection && req.connection.encrypted
        ? 'https' : 'http') + `://${req.headers.host}`
}