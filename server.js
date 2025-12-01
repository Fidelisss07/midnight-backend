const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CONEXÃO MONGODB ---
const MONGO_URI = "mongodb+srv://Fidelis:Gulipe116@midnightcircuit.5srlwec.mongodb.net/?retryWrites=true&w=majority&appName=midnightcircuit";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado ao MongoDB!"))
    .catch(err => console.error("❌ Erro Mongo:", err));

// --- 2. CONFIGURAÇÃO UPLOAD (MULTER) ---
// Isto corrige o teu erro "upload is not defined"
const fs = require('fs');
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
// Serve o site (HTML/CSS)
app.use(express.static(__dirname));

// --- 3. MODELOS (SCHEMAS) DO BANCO DE DADOS ---
// Aqui definimos as regras dos dados

const UserSchema = new mongoose.Schema({
    nome: String,
    email: { type: String, unique: true },
    senha: String,
    avatar: String,
    capa: String,
    bio: String,
    xp: { type: Number, default: 0 },
    nivel: { type: Number, default: 1 },
    seguindo: [String],   // Lista de emails
    seguidores: [String]  // Lista de emails
});
const User = mongoose.model('User', UserSchema);

const PostSchema = new mongoose.Schema({
    emailAutor: String,
    nome: String,
    avatar: String,
    conteudo: String,
    midiaUrl: String,
    tipo: String, // 'imagem' ou 'video'
    likes: { type: Number, default: 0 },
    comentarios: [{ autor: String, avatar: String, texto: String, data: { type: Date, default: Date.now } }],
    timestamp: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', PostSchema);

const CarroSchema = new mongoose.Schema({
    dono: String, // Nome do dono
    emailDono: String, // Email para segurança (novo)
    marca: String,
    modelo: String,
    apelido: String,
    imagemUrl: String,
    specs: Object, // { hp: '...', torque: '...' }
    mods: [String],
    timestamp: { type: Date, default: Date.now }
});
const Carro = mongoose.model('Carro', CarroSchema);

const SprintSchema = new mongoose.Schema({
    autor: String,
    emailAutor: String,
    avatar: String,
    descricao: String,
    videoUrl: String,
    likes: { type: Number, default: 0 },
    comentarios: [{ autor: String, avatar: String, texto: String }],
    timestamp: { type: Date, default: Date.now }
});
const Sprint = mongoose.model('Sprint', SprintSchema);

const NotificacaoSchema = new mongoose.Schema({
    tipo: String, // 'like', 'follow', 'comentario'
    de: String, // Nome
    avatar: String,
    para: String, // Email destino
    texto: String,
    imgPreview: String,
    lida: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});
const Notificacao = mongoose.model('Notificacao', NotificacaoSchema);

const ChatSchema = new mongoose.Schema({
    de: String, // Email
    para: String, // Email
    texto: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', ChatSchema);

const ComunidadeSchema = new mongoose.Schema({
    nome: String,
    descricao: String,
    dono: String, // Email
    imagem: String,
    membros: [String], // Lista emails
    admins: [String],  // Lista emails
    timestamp: { type: Date, default: Date.now }
});
const Comunidade = mongoose.model('Comunidade', ComunidadeSchema);

const ForumSchema = new mongoose.Schema({
    comunidadeId: String,
    titulo: String,
    conteudo: String,
    autor: String,
    emailAutor: String,
    avatar: String,
    likes: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});
const Forum = mongoose.model('Forum', ForumSchema);


// --- HELPERS ---
async function ganharXP(email, qtd) {
    if(!email) return;
    const user = await User.findOne({ email });
    if (user) {
        user.xp = (user.xp || 0) + qtd;
        const novoNivel = Math.floor(user.xp / 1000) + 1;
        if (novoNivel > user.nivel) user.nivel = novoNivel;
        await user.save();
    }
}

async function notificar(tipo, deObj, paraEmail, texto, img = null) {
    if (deObj.email === paraEmail) return;
    await Notificacao.create({
        tipo,
        de: deObj.nome,
        avatar: deObj.avatar,
        para: paraEmail,
        texto,
        imgPreview: img
    });
}


// ================= ROTAS (AGORA COM MONGODB) =================

// 1. AUTENTICAÇÃO
app.post('/registro', async (req, res) => {
    try {
        const existe = await User.findOne({ email: req.body.email });
        if (existe) return res.status(400).send('Email já existe');

        const senhaHash = await bcrypt.hash(req.body.senha, 10);
        const novoUser = await User.create({
            ...req.body,
            senha: senhaHash,
            avatar: `https://ui-avatars.com/api/?name=${req.body.nome}&background=ef4444&color=fff`,
            capa: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1000",
            bio: "Novo piloto",
            xp: 0, nivel: 1
        });
        res.status(201).json(novoUser);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) return res.status(401).send('Utilizador não encontrado');
        
        const valida = await bcrypt.compare(req.body.senha, user.senha);
        if (!valida) return res.status(401).send('Senha incorreta');
        
        res.json(user);
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/usuarios', async (req, res) => {
    const users = await User.find({}, 'nome email avatar nivel seguindo seguidores'); // Pega só dados públicos
    res.json(users);
});

// 2. PERFIL
app.get('/perfil/dados', async (req, res) => {
    const user = await User.findOne({ email: req.query.email });
    user ? res.json(user) : res.status(404).json({});
});

app.post('/perfil/atualizar', upload.fields([{name:'avatar'},{name:'capa'}]), async (req, res) => {
    try {
        const updateData = { nome: req.body.nome, bio: req.body.bio };
        if(req.files['avatar']) updateData.avatar = `/uploads/${req.files['avatar'][0].filename}`;
        if(req.files['capa']) updateData.capa = `/uploads/${req.files['capa'][0].filename}`;
        
        const user = await User.findOneAndUpdate({ email: req.body.emailOriginal }, updateData, { new: true });
        res.json(user);
    } catch(e) { res.status(500).send("Erro ao atualizar"); }
});

app.post('/seguir', async (req, res) => {
    const { eu, ele } = req.body;
    const userEu = await User.findOne({ email: eu });
    const userEle = await User.findOne({ email: ele });
    
    if(userEu && userEle) {
        if(userEu.seguindo.includes(ele)) {
            // Deixar de seguir
            userEu.seguindo = userEu.seguindo.filter(e => e !== ele);
            userEle.seguidores = userEle.seguidores.filter(e => e !== eu);
            await userEu.save(); await userEle.save();
            res.json({ aSeguir: false });
        } else {
            // Seguir
            userEu.seguindo.push(ele);
            userEle.seguidores.push(eu);
            await userEu.save(); await userEle.save();
            notificar('follow', { nome: userEu.nome, email: eu, avatar: userEu.avatar }, ele, 'começou a seguir-te.');
            res.json({ aSeguir: true });
        }
    } else res.status(404).send('Erro');
});

// 3. FEED & POSTS
app.get('/posts', async (req, res) => {
    const posts = await Post.find().sort({ timestamp: -1 }); // Mais recentes primeiro
    res.json(posts);
});

app.post('/posts', upload.single('midia'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : null;
    const tipo = (req.file && req.file.mimetype.startsWith('video')) ? 'video' : 'imagem';
    
    await Post.create({ ...req.body, midiaUrl: url, tipo });
    ganharXP(req.body.emailAutor, 50);
    res.status(201).send('Ok');
});

app.post('/posts/like/:id', async (req, res) => {
    // No Mongo o ID é _id, mas no frontend estamos a mandar o ID do post antigo.
    // Como mudamos para mongo, vamos ter de adaptar. 
    // Para facilitar, vamos procurar por _id ou id antigo se houver migração.
    // Nota: O frontend manda o ID. O Mongo usa _id.
    try {
        const post = await Post.findById(req.params.id) || await Post.findOne({ id: req.params.id });
        if (post) {
            post.likes++;
            await post.save();
            if(post.emailAutor) notificar('like', req.body, post.emailAutor, 'curtiu.', post.midiaUrl);
            res.send('Ok');
        } else res.status(404).send('Post não encontrado');
    } catch(e) { res.status(500).send('Erro ID'); }
});

app.post('/posts/comentar/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id); // Tenta pelo ID do Mongo
        if (post) {
            post.comentarios.push(req.body);
            await post.save();
            if(post.emailAutor) notificar('comentario', req.body, post.emailAutor, 'comentou.', post.midiaUrl);
            res.json(post.comentarios);
        } else res.status(404).send('Erro');
    } catch(e) { res.status(500).send(e.message); }
});

// 4. GARAGEM
app.get('/carros', async (req, res) => {
    const carros = await Carro.find();
    res.json(carros);
});
app.post('/carros', upload.single('imagem'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/600';
    // Tenta encontrar dono pelo nome, mas idealmente devia ser pelo email.
    // Vamos manter pelo nome para compatibilidade com o frontend atual.
    const user = await User.findOne({ nome: req.body.dono });
    
    await Carro.create({
        ...req.body,
        emailDono: user ? user.email : null,
        imagemUrl: url,
        mods: req.body.mods ? req.body.mods.split(',') : [],
        specs: {
            hp: req.body.hp, torque: req.body.torque, zero_cem: req.body.zero_cem,
            top_speed: req.body.top_speed, cor: req.body.cor, ano: req.body.ano,
            motor: req.body.motor, cambio: req.body.cambio, tracao: req.body.tracao, peso: req.body.peso
        }
    });
    if(user) ganharXP(user.email, 100);
    res.status(201).send('Ok');
});
app.delete('/carros/:id', async (req, res) => {
    try {
        await Carro.findByIdAndDelete(req.params.id);
        res.send('Ok');
    } catch(e) { res.status(500).send('Erro'); }
});

// 5. SPRINTS
app.get('/sprints', async (req, res) => {
    const sprints = await Sprint.find().sort({ timestamp: -1 });
    res.json(sprints);
});
app.post('/sprints', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).send('Sem vídeo');
    await Sprint.create({
        ...req.body,
        videoUrl: `/uploads/${req.file.filename}`
    });
    ganharXP(req.body.emailAutor, 40);
    res.status(201).send('Ok');
});
app.post('/sprints/like/:id', async (req, res) => {
    try {
        const s = await Sprint.findById(req.params.id);
        if(s) { s.likes++; await s.save(); res.send('Ok'); }
    } catch(e) {}
});
app.post('/sprints/comentar/:id', async (req, res) => {
    try {
        const s = await Sprint.findById(req.params.id);
        if(s) { s.comentarios.push(req.body); await s.save(); res.json(s.comentarios); }
    } catch(e) {}
});

// 6. COMUNIDADES
app.get('/comunidades', async (req, res) => {
    const coms = await Comunidade.find();
    res.json(coms);
});
app.post('/comunidades', upload.single('imagem'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/800';
    const nova = await Comunidade.create({
        ...req.body,
        dono: req.body.donoEmail,
        imagem: url,
        membros: [req.body.donoEmail]
    });
    ganharXP(req.body.donoEmail, 150);
    res.status(201).send('Ok');
});
app.post('/comunidades/entrar', async (req, res) => {
    const { idComunidade, emailUsuario } = req.body;
    // Procura por ID do Mongo (que é string longa)
    // Se o frontend mandar o ID do mongo, funciona.
    // Vou adaptar para buscar pelo _id
    try {
        const com = await Comunidade.findById(idComunidade);
        if(com && !com.membros.includes(emailUsuario)) {
            com.membros.push(emailUsuario);
            await com.save();
            res.send('Ok');
        }
    } catch(e) {}
});

// 7. FÓRUM (Topicos)
app.get('/topicos/:id', async (req, res) => {
    const topicos = await Forum.find({ comunidadeId: req.params.id });
    res.json(topicos);
});
app.post('/topicos', upload.single('imagem'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : null;
    await Forum.create({ ...req.body, imagemUrl: url });
    ganharXP(req.body.emailAutor, 30);
    res.status(201).send('Ok');
});

// 8. GERAIS
app.get('/notificacoes', async (req, res) => {
    const notifs = await Notificacao.find({ para: req.query.user }).sort({ timestamp: -1 });
    res.json(notifs);
});
app.post('/notificacoes/ler', async (req, res) => {
    await Notificacao.updateMany({ para: req.body.user }, { lida: true });
    res.send('Ok');
});
app.get('/mensagens', async (req, res) => {
    const { eu, ele } = req.query;
    const msgs = await Chat.find({
        $or: [
            { de: eu, para: ele },
            { de: ele, para: eu }
        ]
    }).sort({ timestamp: 1 });
    res.json(msgs);
});
app.post('/mensagens', async (req, res) => {
    await Chat.create(req.body);
    res.status(201).send('Ok');
});
app.get('/ranking', async (req, res) => {
    const top = await User.find({}, 'nome avatar nivel xp email').sort({ xp: -1 }).limit(50);
    res.json(top);
});
app.get('/pesquisa', async (req, res) => {
    const t = req.query.q;
    const regex = new RegExp(t, 'i'); // Busca case-insensitive
    const users = await User.find({ nome: regex });
    const cars = await Carro.find({ $or: [{ modelo: regex }, { apelido: regex }] });
    res.json({ usuarios: users, carros: cars });
});

app.listen(PORT, () => console.log(`🔥 Server MongoDB V1.0 RODANDO na porta ${PORT}`));