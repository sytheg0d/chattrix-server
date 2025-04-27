const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// MongoDB Bağlantısı
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
  role: { type: String, default: 'user' } // user, moderator, admin, god
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

// API: Admin Panel Girişi
const adminToken = "159753456hang0ver";
app.post('/admin-login', (req, res) => {
  const { token } = req.body;
  if (token === adminToken) {
    return res.status(200).json({ success: true, message: 'Admin paneline giriş başarılı' });
  } else {
    return res.status(403).json({ success: false, message: 'Geçersiz token' });
  }
});

// API: Login
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
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
    }
  } catch (err) {
    console.error('❌ Login hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const banned = await BannedIP.findOne({ ip });
    if (banned) {
      return res.status(403).json({ success: false, message: 'Bu siteden kalıcı olarak yasaklandınız.' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Kullanıcı zaten var' });
    }
    const newUser = new User({ username, password });
    await newUser.save();
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ Register hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Get Users
app.get('/get-users', async (req, res) => {
  try {
    const users = await User.find({});
    return res.status(200).json(users);
  } catch (err) {
    console.error('❌ Kullanıcı çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Update Role
app.post('/update-role', async (req, res) => {
  const { username, newRole } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false, message: 'Bu kullanıcının yetkisi değiştirilemez.' });
    }
    await User.updateOne({ username }, { role: newRole });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Rol güncelleme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Delete User
app.post('/delete-user', async (req, res) => {
  const { username } = req.body;
  try {
    if (username.toLowerCase() === 'hang0ver') {
      return res.status(403).json({ success: false, message: 'Bu kullanıcı silinemez.' });
    }
    await User.deleteOne({ username });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Kullanıcı silme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Logları çek
app.get('/logs', async (req, res) => {
  try {
    const logs = await Log.find({}).sort({ timestamp: -1 });
    return res.status(200).json(logs);
  } catch (err) {
    console.error('❌ Log çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Banlı IP'leri çek
app.get('/banned-ips', async (req, res) => {
  try {
    const ips = await BannedIP.find({});
    return res.status(200).json(ips);
  } catch (err) {
    console.error('❌ Banlı IP çekme hatası:', err);
    return res.status(500).json({ success: false });
  }
});

// API: Banlı IP'yi kaldır
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

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  socket.on('join', async (username) => {
    const userData = await User.findOne({ username });
    if (!userData) {
      console.error('❌ Kullanıcı bulunamadı:', username);
      return;
    }

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
    const senderData = await User.findOne({ username: data.sender });

    if (mutedUsers.has(data.sender)) {
      socket.emit('receive_message', {
        sender: 'Sistem',
        message: 'Susturuldunuz.',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    if (data.message.startsWith('/yetkiver') && senderData && senderData.role === 'god') {
      const parts = data.message.split(' ');
      const newRole = parts[1]?.toLowerCase();
      const targetUsername = parts[2]?.replace('@', '');

      if (['admin', 'moderator'].includes(newRole) && targetUsername) {
        if (targetUsername.toLowerCase() === 'hang0ver') {
          socket.emit('receive_message', {
            sender: 'Sistem',
            message: `Bu kullanıcının yetkisi değiştirilemez.`,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }

        await User.updateOne({ username: targetUsername }, { role: newRole });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısına ${newRole.toUpperCase()} yetkisi verildi.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    if (data.message.startsWith('/yetkisil') && senderData && senderData.role === 'god') {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername) {
        if (targetUsername.toLowerCase() === 'hang0ver') {
          socket.emit('receive_message', {
            sender: 'Sistem',
            message: `Bu kullanıcının yetkisi silinemez.`,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }

        await User.updateOne({ username: targetUsername }, { role: 'user' });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısının tüm yetkileri kaldırıldı.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    if (data.message.startsWith('/mute') && senderData && (senderData.role === 'god' || senderData.role === 'admin' || senderData.role === 'moderator')) {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername) {
        mutedUsers.set(targetUsername, true);
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısı susturuldu.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
      return;
    }

    if (data.message.startsWith('/ban') && senderData && (senderData.role === 'god' || senderData.role === 'admin')) {
      const parts = data.message.split(' ');
      const targetUsername = parts[1]?.replace('@', '');

      if (targetUsername) {
        for (const [id, user] of onlineUsers.entries()) {
          if (user.username === targetUsername) {
            const bannedIP = socket.handshake.address;
            const newBanned = new BannedIP({ ip: bannedIP });
            await newBanned.save();
            const bannedSocket = io.sockets.sockets.get(id);
            if (bannedSocket) bannedSocket.disconnect();

            io.emit('receive_message', {
              sender: 'Sistem',
              message: `${targetUsername} IP adresi ile kalıcı olarak yasaklandı.`,
              timestamp: new Date().toLocaleTimeString()
            });
            break;
          }
        }
      }
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

    const ip = socket.handshake.address;
    const logoutLog = new Log({
      username,
      ip,
      type: 'logout',
      timestamp: new Date().toLocaleString()
    });
    await logoutLog.save();
  });

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      io.emit('update_users', Array.from(onlineUsers.values()));
    }
  });
});

// Sunucu Başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
