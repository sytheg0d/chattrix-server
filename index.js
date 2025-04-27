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

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  socket.on('join', async (username) => {
    onlineUsers.set(socket.id, username);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));

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

    // Mute kontrolü
    if (mutedUsers.has(data.sender)) {
      socket.emit('receive_message', { sender: 'Sistem', message: 'Susturulduğunuz.', timestamp: new Date().toLocaleTimeString() });
      return;
    }

    // /yetkiver Komutu
    if (data.message.startsWith('/yetkiver') && senderData?.role === 'god') {
      const parts = data.message.split(' ');
      const newRole = parts[1]?.toLowerCase();
      const target = parts[2]?.replace('@', '');
      if (['admin', 'moderator'].includes(newRole) && target) {
        await User.updateOne({ username: target }, { role: newRole });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${target} kullanıcısına ${newRole.toUpperCase()} yetkisi verildi.`,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }

    // /yetkisil Komutu
    if (data.message.startsWith('/yetkisil') && senderData?.role === 'god') {
      const targetUsername = data.message.split(' ')[1]?.replace('@', '');
      if (targetUsername.toLowerCase() !== 'hang0ver') {
        await User.updateOne({ username: targetUsername }, { role: 'user' });
        io.emit('receive_message', {
          sender: 'Sistem',
          message: `${targetUsername} kullanıcısının yetkisi kaldırıldı.`,
          timestamp: new Date().toLocaleTimeString()
        });
      } else {
        socket.emit('receive_message', {
          sender: 'Sistem',
          message: 'Bu kullanıcının yetkisi silinemez.',
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }

    // /mute Komutu
    if (data.message.startsWith('/mute') && senderData?.role === 'god') {
      const targetUsername = data.message.split(' ')[1]?.replace('@', '');
      mutedUsers.set(targetUsername, true); // Kullanıcıyı sustur
      io.emit('receive_message', {
        sender: 'Sistem',
        message: `${targetUsername} kullanıcısı susturuldu.`,
        timestamp: new Date().toLocaleTimeString()
      });
    }

    // Mesajı kaydet ve gönder
    const newMessage = new Message(data);
    await newMessage.save();
    io.emit('receive_message', data);
  });

  socket.on('logout', async (username) => {
    for (const [id, name] of onlineUsers.entries()) {
      if (name === username) {
        onlineUsers.delete(id);
      }
    }
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));

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
    const username = onlineUsers.get(socket.id);
    if (username) {
      onlineUsers.delete(socket.id);
      io.emit('update_users', Array.from(new Set(onlineUsers.values())));
    }
  });
});

// Sunucu Başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
