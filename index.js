// index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// MongoDB bağlantısı
mongoose.connect('mongodb+srv://chattrixadmin:159753456@cluster0.9pzwvk6.mongodb.net/chattrix?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB bağlantısı başarılı'))
  .catch((err) => console.error('❌ MongoDB bağlantı hatası:', err));

// Şemalar
const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  timestamp: String
});
const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
});
const User = mongoose.model('User', userSchema);

const logSchema = new mongoose.Schema({
  username: String,
  ip: String,
  type: String,
  timestamp: String
});
const Log = mongoose.model('Log', logSchema);

const bannedIPSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true }
});
const BannedIP = mongoose.model('BannedIP', bannedIPSchema);

// Middleware
const corsOptions = {
  origin: 'https://chattrix-2ur3.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Sunucu
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

let onlineUsers = new Map();
let mutedUsers = new Map();

// Banlı IP Kontrolü
io.use(async (socket, next) => {
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const banned = await BannedIP.findOne({ ip });
  if (banned) {
    console.log(`⛔ Yasaklı IP'den bağlantı reddedildi: ${ip}`);
    return next(new Error('Bu siteden kalıcı olarak yasaklandınız.'));
  }
  next();
});

// Admin Token
const adminToken = "159753456hang0ver";

// Admin giriş API
app.post('/admin-login', (req, res) => {
  const { token } = req.body;
  if (token === adminToken) {
    return res.status(200).json({ success: true });
  } else {
    return res.status(403).json({ success: false });
  }
});

// Login API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && user.password === password) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const newLog = new Log({ username, ip, type: 'login', timestamp: new Date().toLocaleString() });
      await newLog.save();
      return res.status(200).json({ success: true, role: user.role });
    } else {
      return res.status(401).json({ success: false });
    }
  } catch (err) {
    console.error('❌ Login hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Register API
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const banned = await BannedIP.findOne({ ip });
    if (banned) {
      return res.status(403).json({ success: false });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false });
    }
    const newUser = new User({ username, password });
    await newUser.save();
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ Register hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı çekme API
app.get('/get-users', async (req, res) => {
  try {
    const users = await User.find({});
    return res.status(200).json(users);
  } catch (err) {
    console.error('❌ Kullanıcı çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Rol güncelleme API
app.post('/update-role', async (req, res) => {
  const { username, newRole } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false });
    }
    await User.updateOne({ username }, { role: newRole });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Rol güncelleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Kullanıcı silme API
app.post('/delete-user', async (req, res) => {
  const { username } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false });
    }
    await User.deleteOne({ username });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Kullanıcı silme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Banlı IP çekme API
app.get('/banned-ips', async (req, res) => {
  try {
    const ips = await BannedIP.find({});
    return res.status(200).json(ips);
  } catch (err) {
    console.error('❌ Banlı IP çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// Ban kaldırma API
app.post('/unban-ip', async (req, res) => {
  const { ip } = req.body;
  try {
    await BannedIP.deleteOne({ ip });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ IP kaldırma hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// SOCKET.IO olayları
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  socket.on('join', async (username) => {
    const userData = await User.findOne({ username });
    if (!userData) return;
    onlineUsers.set(socket.id, { username: userData.username, role: userData.role });
    io.emit('update_users', Array.from(onlineUsers.values()));

    const oldMessages = await Message.find({});
    oldMessages.forEach((msg) => socket.emit('receive_message', msg));

    const joinMessage = new Message({
      sender: 'Sistem',
      message: `${username} sohbete katıldı.`,
      timestamp: new Date().toLocaleTimeString()
    });
    await joinMessage.save();
    io.emit('receive_message', joinMessage);
  });

  socket.on('send_message', async (data) => {
    if (mutedUsers.has(data.sender)) {
      socket.emit('receive_message', { sender: 'Sistem', message: 'Susturuldunuz.', timestamp: new Date().toLocaleTimeString() });
      return;
    }

    const newMessage = new Message(data);
    await newMessage.save();
    io.emit('receive_message', data);
  });

  socket.on('logout', async (username) => {
    for (const [id, user] of onlineUsers.entries()) {
      if (user.username === username) {
        onlineUsers.delete(id);
      }
    }
    io.emit('update_users', Array.from(onlineUsers.values()));

    const leaveMessage = new Message({
      sender: 'Sistem',
      message: `${username} sohbetten ayrıldı.`,
      timestamp: new Date().toLocaleTimeString()
    });
    await leaveMessage.save();
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('update_users', Array.from(onlineUsers.values()));
  });
});

// Sunucu başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
