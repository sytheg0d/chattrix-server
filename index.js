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

// Mesaj Şeması
const messageSchema = new mongoose.Schema({
  sender: String,
  message: String,
  timestamp: String
});

const Message = mongoose.model('Message', messageSchema);

// Kullanıcı Şeması
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' } // ✅ Rol alanı eklendi
});

const User = mongoose.model('User', userSchema);

// Giriş Çıkış Log Şeması
const logSchema = new mongoose.Schema({
  username: String,
  ip: String,
  type: String, // login veya logout
  timestamp: String
});

const Log = mongoose.model('Log', logSchema);

const corsOptions = {
  origin: 'https://chattrix-2ur3.onrender.com',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'https://chattrix-2ur3.onrender.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Çevrimiçi kullanıcılar
let onlineUsers = new Map();

// API: Giriş
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (user && user.password === password) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      const newLog = new Log({
        username,
        ip,
        type: 'login',
        timestamp: new Date().toLocaleString()
      });
      await newLog.save();

      return res.status(200).json({ success: true, role: user.role });
    } else {
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre' });
    }
  } catch (err) {
    console.error('❌ Login hatası:', err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// API: Kayıt
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Kullanıcı zaten var' });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ Register hatası:', err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// API: Kullanıcı rolünü değiştirme (sadece admin)
app.post('/update-role', async (req, res) => {
  const { username, newRole } = req.body;

  try {
    await User.updateOne({ username }, { role: newRole });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Rol güncelleme hatası:', err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// API: Kullanıcı silme (sadece admin)
app.post('/delete-user', async (req, res) => {
  const { username } = req.body;

  try {
    await User.deleteOne({ username });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Kullanıcı silme hatası:', err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// API: Logları çekme
app.get('/logs', async (req, res) => {
  try {
    const logs = await Log.find({}).sort({ timestamp: -1 });
    return res.status(200).json(logs);
  } catch (err) {
    console.error('❌ Log çekme hatası:', err);
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('🔌 Kullanıcı bağlandı:', socket.id);

  socket.on('join', async (username) => {
    onlineUsers.set(socket.id, username);
    io.emit('update_users', Array.from(new Set(onlineUsers.values())));

    // 📌 Kullanıcı katılınca eski mesajları çek
    const oldMessages = await Message.find({});
    oldMessages.forEach((msg) => {
      socket.emit('receive_message', {
        sender: msg.sender,
        message: msg.message,
        timestamp: msg.timestamp
      });
    });

    // 📌 Sohbete katıldı mesajı
    const joinMessage = new Message({
      sender: 'Sistem',
      message: `${username} sohbete katıldı.`,
      timestamp: new Date().toLocaleTimeString()
    });

    await joinMessage.save();
    io.emit('receive_message', joinMessage);
  });

  socket.on('send_message', async (data) => {
    const newMessage = new Message({
      sender: data.sender,
      message: data.message,
      timestamp: data.timestamp
    });

    await newMessage.save();
    io.emit('receive_message', newMessage);
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
    io.emit('receive_message', leaveMessage);

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

    setTimeout(async () => {
      if (!Array.from(onlineUsers.keys()).includes(socket.id)) {
        if (username) {
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
          io.emit('receive_message', leaveMessage);

          const ip = socket.handshake.address;
          const disconnectLog = new Log({
            username,
            ip,
            type: 'logout',
            timestamp: new Date().toLocaleString()
          });
          await disconnectLog.save();
        }
      }
    }, 10000); // 10 saniye bekleme
  });
});

// Sunucu başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
