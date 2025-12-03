const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. CONEXÃO MONGODB ---
const MONGO_URI = "mongodb+srv://midnight123:midnight123@cluster1.bpoznnx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado ao MongoDB! JSONs já não são precisos."))
    .catch(err => console.error("❌ Erro Mongo:", err));

// --- 2. CONFIGURAÇÃO UPLOAD ---
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(express.static(__dirname));

// --- 3. SCHEMAS (Estrutura do Banco) ---
const userSchema = new mongoose.Schema({
    nome: String, email: {type: String, unique: true}, senha: String,
    avatar: String, capa: String, bio: String, xp: {type: Number, default: 0},
    nivel: {type: Number, default: 1}, seguindo: [String], seguidores: [String]
});
const User = mongoose.model('User', userSchema);

const postSchema = new mongoose.Schema({
    emailAutor: String, nome: String, avatar: String, conteudo: String, midiaUrl: String,
    tipo: String, likes: {type: Number, default: 0}, comentarios: Array,
    timestamp: {type: Date, default: Date.now}
});
const Post = mongoose.model('Post', postSchema);

const carroSchema = new mongoose.Schema({
    dono: String, emailDono: String, marca: String, modelo: String, apelido: String,
    imagemUrl: String, descricao: String, specs: Object, mods: [String]
});
const Carro = mongoose.model('Carro', carroSchema);

const sprintSchema = new mongoose.Schema({
    autor: String, emailAutor: String, avatar: String, descricao: String, videoUrl: String,
    likes: {type: Number, default: 0}, comentarios: Array, timestamp: {type: Date, default: Date.now}
});
const Sprint = mongoose.model('Sprint', sprintSchema);

const comunidadeSchema = new mongoose.Schema({
    nome: String, descricao: String, dono: String, imagem: String,
    membros: [String], admins: [String], online: {type: Number, default: 1}
});
const Comunidade = mongoose.model('Comunidade', comunidadeSchema);

const forumSchema = new mongoose.Schema({
    comunidadeId: String, titulo: String, conteudo: String, autor: String, emailAutor: String,
    avatar: String, imagemUrl: String, likes: {type: Number, default: 0}, timestamp: {type: Date, default: Date.now}
});
const Forum = mongoose.model('Forum', forumSchema);

const notifSchema = new mongoose.Schema({
    tipo: String, de: String, avatar: String, para: String, texto: String, imgPreview: String,
    lida: {type: Boolean, default: false}, timestamp: {type: Date, default: Date.now}
});
const Notificacao = mongoose.model('Notificacao', notifSchema);

const chatSchema = new mongoose.Schema({
    de: String, para: String, texto: String, timestamp: {type: Date, default: Date.now}
});
const Chat = mongoose.model('Chat', chatSchema);

const storySchema = new mongoose.Schema({
    emailAutor: String, nome: String, avatar: String, midiaUrl: String, tipo: String,
    timestamp: {type: Number, default: Date.now}
});
const Story = mongoose.model('Story', storySchema);

// --- HELPERS ---
async function ganharXP(email, qtd) {
    if (!email) return;
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
    await Notificacao.create({ tipo, de: deObj.nome, avatar: deObj.avatar, para: paraEmail, texto, imgPreview: img });
}

// ================= ROTAS (MONGO PURO) =================

// Auth
app.post('/registro', async (req, res) => {
    try {
        if (await User.findOne({ email: req.body.email })) return res.status(400).send('Email em uso');
        const hash = await bcrypt.hash(req.body.senha, 10);
        const novo = await User.create({ ...req.body, senha: hash, avatar: `https://ui-avatars.com/api/?name=${req.body.nome}&background=ef4444&color=fff`, capa: "https://via.placeholder.com/1000x300", bio: "Novo piloto" });
        res.status(201).json(novo);
    } catch (e) { res.status(500).send("Erro"); }
});
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user || !(await bcrypt.compare(req.body.senha, user.senha))) return res.status(401).send('Erro login');
        res.json(user);
    } catch (e) { res.status(500).send("Erro"); }
});

// Feed
app.get('/posts', async (req, res) => res.json(await Post.find().sort({ timestamp: -1 }).limit(50)));
app.post('/posts', upload.single('midia'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : null;
    const tipo = (req.file && req.file.mimetype.startsWith('video')) ? 'video' : 'imagem';
    await Post.create({ ...req.body, midiaUrl: url, tipo });
    ganharXP(req.body.emailAutor, 50); res.status(201).send('Ok');
});
app.post('/posts/like/:id', async (req, res) => {
    try {
        // Tenta buscar pelo ID (mesmo que seja string antiga ou ObjectId novo)
        let p;
        if (mongoose.isValidObjectId(req.params.id)) p = await Post.findById(req.params.id);
        // Se não achou ou ID inválido, tenta buscar num campo 'id' personalizado se tivesses (aqui assumimos migração limpa)
        
        if (p) { p.likes++; await p.save(); if(p.emailAutor) notificar('like', req.body, p.emailAutor, 'curtiu.', p.midiaUrl); res.send('Ok'); }
        else res.status(404).send('Post não encontrado');
    } catch (e) { res.status(500).send('Erro'); }
});
app.post('/posts/comentar/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).send('ID invalido');
        const p = await Post.findById(req.params.id);
        if (p) { p.comentarios.push(req.body); await p.save(); if(p.emailAutor) notificar('comentario', req.body, p.emailAutor, 'comentou.', p.midiaUrl); res.json(p.comentarios); }
    } catch(e) { res.status(500).send('Erro'); }
});
app.delete('/posts/:id', async (req, res) => { if(mongoose.isValidObjectId(req.params.id)) await Post.findByIdAndDelete(req.params.id); res.send('Ok'); });

// Stories
app.get('/stories', async (req, res) => {
    const ontem = Date.now() - 86400000;
    res.json(await Story.find({ timestamp: { $gt: ontem } }));
});
app.post('/stories', upload.single('midia'), async (req, res) => {
    if(!req.file) return res.status(400).send('X');
    const v = req.file.mimetype.startsWith('video');
    await Story.create({ ...req.body, midiaUrl: `/uploads/${req.file.filename}`, tipo: v?'video':'imagem', timestamp: Date.now() });
    res.status(201).send('Ok');
});

// Carros
app.get('/carros', async (req, res) => res.json(await Carro.find()));
app.post('/carros', upload.single('imagem'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/600';
    await Carro.create({ ...req.body, imagemUrl: url, mods: req.body.mods?req.body.mods.split(','):[] });
    ganharXP(req.body.emailDono, 100); res.status(201).send('Ok'); // Nota: Frontend deve mandar emailDono agora, ou usamos o nome para achar o user
});
app.delete('/carros/:id', async (req, res) => { if(mongoose.isValidObjectId(req.params.id)) await Carro.findByIdAndDelete(req.params.id); res.send('Ok'); });

// Sprints
app.get('/sprints', async (req, res) => res.json(await Sprint.find().sort({ timestamp: -1 })));
app.post('/sprints', upload.single('video'), async (req, res) => {
    if(!req.file) return res.status(400).send('X');
    await Sprint.create({ ...req.body, videoUrl: `/uploads/${req.file.filename}` });
    ganharXP(req.body.emailAutor, 40); res.status(201).send('Ok');
});
app.post('/sprints/like/:id', async (req, res) => { if(mongoose.isValidObjectId(req.params.id)){ const s=await Sprint.findById(req.params.id); if(s){s.likes++; await s.save(); res.send('Ok');}} });
app.post('/sprints/comentar/:id', async (req, res) => { if(mongoose.isValidObjectId(req.params.id)){ const s=await Sprint.findById(req.params.id); if(s){s.comentarios.push(req.body); await s.save(); res.json(s.comentarios);}} });

// Comunidades
app.get('/comunidades', async (req, res) => res.json(await Comunidade.find()));
app.post('/comunidades', upload.single('imagem'), async (req, res) => { 
    const url = req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/800';
    await Comunidade.create({ ...req.body, imagem: url, membros: [req.body.donoEmail] });
    ganharXP(req.body.donoEmail, 150); res.status(201).send('Ok');
});
app.post('/comunidades/entrar', async (req, res) => {
    const { id, email } = req.body;
    if(mongoose.isValidObjectId(id)){ const c=await Comunidade.findById(id); if(c&&!c.membros.includes(email)){c.membros.push(email); await c.save(); ganharXP(email, 20); res.send('Ok');} }
});
app.post('/comunidades/sair', async (req, res) => {
    const { id, email } = req.body;
    if(mongoose.isValidObjectId(id)){ const c=await Comunidade.findById(id); if(c){c.membros=c.membros.filter(m=>m!==email); await c.save(); res.send('Ok');} }
});
app.get('/topicos/:id', async (req, res) => res.json(await Forum.find({ comunidadeId: req.params.id })));
app.post('/topicos', upload.single('imagem'), async (req, res) => {
    const url = req.file ? `/uploads/${req.file.filename}` : null;
    await Forum.create({ ...req.body, imagemUrl: url });
    ganharXP(req.body.emailAutor, 30); res.status(201).send('Ok');
});
app.post('/topicos/like/:id', async (req, res) => { if(mongoose.isValidObjectId(req.params.id)){ const t=await Forum.findById(req.params.id); if(t){t.likes++; await t.save(); res.send('Ok');}} });

// Outros
app.get('/usuarios', async (req, res) => res.json(await User.find({}, 'nome email avatar nivel seguindo seguidores')));
app.get('/pesquisa', async (req, res) => {
    const t = new RegExp(req.query.q, 'i');
    res.json({ usuarios: await User.find({ nome: t }), carros: await Carro.find({ $or: [{ modelo: t }, { apelido: t }] }) });
});
app.post('/seguir', async (req, res) => {
    const { eu, ele } = req.body;
    const uEu = await User.findOne({ email: eu }); const uEle = await User.findOne({ email: ele });
    if(uEu && uEle) {
        if(uEu.seguindo.includes(ele)) {
            uEu.seguindo = uEu.seguindo.filter(e => e !== ele); uEle.seguidores = uEle.seguidores.filter(e => e !== eu);
            await uEu.save(); await uEle.save(); res.json({ aSeguir: false });
        } else {
            uEu.seguindo.push(ele); uEle.seguidores.push(eu);
            await uEu.save(); await uEle.save(); notificar('follow', { nome: uEu.nome, email: eu, avatar: uEu.avatar }, ele, 'seguiu-te.');
            res.json({ aSeguir: true });
        }
    }
});
app.get('/notificacoes', async (req, res) => res.json(await Notificacao.find({ para: req.query.user }).sort({ timestamp: -1 })));
app.post('/notificacoes/ler', async (req, res) => { await Notificacao.updateMany({ para: req.body.user }, { lida: true }); res.send('Ok'); });
app.get('/mensagens', async (req, res) => { const { eu, ele } = req.query; res.json(await Chat.find({ $or: [{de:eu,para:ele}, {de:ele,para:eu}] }).sort({ timestamp: 1 })); });
app.post('/mensagens', async (req, res) => { await Chat.create(req.body); res.status(201).send('Ok'); });
app.get('/ranking', async (req, res) => res.json(await User.find({}, 'nome avatar nivel xp email').sort({ xp: -1 }).limit(50)));
app.get('/news', (req, res) => { try{res.json(JSON.parse(fs.readFileSync('news.json')))}catch{res.json([])} });

app.listen(PORT, () => console.log(`🔥 Midnight (Mongo Puro) ONLINE: http://localhost:${PORT}/login.html`));